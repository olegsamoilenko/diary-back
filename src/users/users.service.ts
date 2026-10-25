import { validateCheckinSettings } from './types/checkin-settings';
import { validateThemeSelection } from './types/theme-selection';
import { getAdminUserOverview } from './admin-user-overview';
import { validateMetricTracking } from './types/metric-tracking';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UniqueId } from './entities/unique-id.entity';
import { Repository, In, IsNull } from 'typeorm';
import { AuthService } from 'src/auth/auth.service';
import { throwError } from '../common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import * as bcrypt from 'bcryptjs';
import { PaymentsService } from 'src/payments/payments.service';
import { TokensService } from 'src/tokens/tokens.service';
import { PlansService } from 'src/plans/plans.service';
import { SaltService } from 'src/salt/salt.service';
import { generateHash } from 'src/common/utils/generateHash';
import { ChangeUserAuthDataDto } from './dto/change-user-auth-data.dto';
import { emailChangeSubject } from '../common/translations';
import { EmailsService } from 'src/emails/emails.service';
import { UserSettings } from './entities/user-settings.entity';
import {
  AcquisitionMetaJson,
  AiModel,
  Lang,
  SortBy,
  Theme,
  HasPlan,
  Role,
  DiaryTabVariant,
  CalendarIconFutureRange,
  normalizeAiModel,
} from './types';
import { sleep } from 'src/common/utils/crypto';
import { CodeCoreService } from 'src/code-core/code-core.service';
import { Platform } from '../common/types/platform';
import { ReleaseNotificationsService } from 'src/notifications/release-notifications.service';
import { CommonNotificationsService } from 'src/notifications/common-notifications.service';
import { Plan } from 'src/plans/entities/plan.entity';
import { SessionsService } from 'src/auth/sessions.service';
import { AiPreferencesService } from 'src/ai/ai-preferences.service';
import { UserAiPreferences } from 'src/ai/entities/user-ai-preferences.entity';
import type { AiPrefsPayload } from '../ai/types';
import { DialogsStat } from 'src/diary-statistics/entities/dialogs-stat.entity';
import { EntriesStat } from 'src/diary-statistics/entities/entries-stat.entity';
import { CheckinsStat } from 'src/diary-statistics/entities/checkins-stat.entity';
import { CheckinDialogsStat } from 'src/diary-statistics/entities/checkin-dialogs-stat.entity';
import { CreatePlanDto } from '../plans/dto';
import { UserStatisticsService } from 'src/user-statistics/user-statistics.service';
import dayjs from 'dayjs';
import { ForumTopicReadStatesService } from '../forum/services/forum-topic-read-states.service';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';
import { PlannerCreationStat } from '../planner-statistics/entities/planner-creation-stat.entity';
import { GoalsStat } from '../goals-statistics/entities/goals-stat.entity';
import { CreditWalletService } from '../credits/credit-wallet.service';
import {
  ADMIN_TIMEZONE,
  adminPrivateFields,
  filterRegistrations,
  positiveInteger,
  publicAdminData,
  registrationRange,
  RegistrationRange,
} from './admin-user-statistics';
import {
  PLANNER_TYPES,
  PlannerType,
} from '../planner-statistics/planner-statistics.dto';

export type SendDeleteCodeResult =
  | { status: 'SENT' }
  | { status: 'COOLDOWN'; retryAfterSec: number };

export type VerifyDeleteCodeResult =
  | { status: 'OK' }
  | { status: 'INVALID_CODE' }
  | { status: 'EXPIRED_CODE' }
  | { status: 'ATTEMPTS_EXCEEDED' }
  | { status: 'RATE_LIMITED' };

type UserWithStats = User & {
  dialogsStatsCount: number;
  entriesStatsCount: number;
  checkinsStatsCount: number;
  checkinDialogsStatsCount: number;
  plan: Plan | null;
};

type UserWithSubscriptionState = User & {
  subscriptionState?: UserPlanState | null;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private usersSettingsRepository: Repository<UserSettings>,
    @InjectRepository(UniqueId)
    private uniqueIdRepository: Repository<UniqueId>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly paymentsService: PaymentsService,
    private readonly tokensService: TokensService,
    @Inject(forwardRef(() => PlansService))
    private readonly plansService: PlansService,
    private readonly saltService: SaltService,
    private readonly emailsService: EmailsService,
    private readonly codeCore: CodeCoreService,
    private readonly releaseNotificationsService: ReleaseNotificationsService,
    private readonly commonNotificationsService: CommonNotificationsService,
    private readonly sessionsService: SessionsService,
    private readonly aiPreferencesService: AiPreferencesService,
    private readonly userStatisticsService: UserStatisticsService,
    private readonly forumTopicReadStatesService: ForumTopicReadStatesService,
    @Optional()
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService?: SubscriptionsService,
    @Optional()
    private readonly creditWalletService?: CreditWalletService,
  ) {}

  /** A new anonymous profile is not a new device. All registry writers share this lock. */
  private async claimFirstDeviceInstall(uniqueId: string | null): Promise<boolean> {
    if (typeof uniqueId !== 'string' || !uniqueId.trim()) return false;
    return this.uniqueIdRepository.manager.transaction(async (manager) => {
      // Transaction-scoped PostgreSQL lock also covers simultaneous first requests.
      // No registry cleanup on logout/account deletion: eligibility belongs to the device.
      await manager.query('SELECT pg_advisory_xact_lock(728491, hashtext($1))', [
        uniqueId,
      ]);
      const registry = manager.getRepository(UniqueId);
      if (await registry.findOne({ where: { uniqueId } })) return false;
      await registry.save(registry.create({ uniqueId }));
      return true;
    });
  }

  async createUserByUUID(
    uuid: string,
    lang: Lang,
    theme: Theme,
    aiModel: AiModel,
    platform: Platform,
    regionCode: string,
    devicePubKey: string,
    deviceId: string | null,
    appVersion: string,
    appBuild: number,
    locale: string,
    timezone: string,
    firstDayOfWeek: number,
    model: string,
    osVersion: string,
    osBuildId: string,
    uniqueId: string | null,
    acquisitionSource: string | null,
    acquisitionMetaJson: AcquisitionMetaJson | null | undefined,
    planData?: CreatePlanDto,
    userAgent?: string | null,
    ip?: string | null,
  ): Promise<{
    accessToken: string;
    user: User | null;
  }> {
    this.assertDevicePubKey(devicePubKey);

    const isFirstInstall = await this.claimFirstDeviceInstall(uniqueId);

    const saltValue = this.saltService.generateSalt();

    const hash = generateHash(uuid, saltValue);

    if (!hash || !saltValue) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Error generating hash and salt',
        'Something went wrong while generating hash and salt.',
        'ERROR_GENERATING_HASH',
      );
    }

    const user = this.usersRepository.create({
      uuid,
      hash,
      usesWithoutSubscription: !isFirstInstall,
      regionCode: regionCode?.trim().toUpperCase() || '',
      acquisitionSource,
      acquisitionMetaJson: acquisitionMetaJson ?? {},
    });
    const savedUser = await this.usersRepository.save(user);

    await this.forumTopicReadStatesService.markAllExistingTopicsAsReadForNewUser(
      savedUser.id,
    );

    await this.saltService.saveSalt(savedUser.id, saltValue);

    const settings = this.usersSettingsRepository.create({
      lang,
      theme,
      aiModel: normalizeAiModel(aiModel),
      user: savedUser,
      platform,
      appVersion,
      appBuild,
      locale,
      timezone,
      firstDayOfWeek,
      model,
      osVersion,
      osBuildId,
      uniqueId,
      shortAiReflectionEnabled: true,
      aiAnalysisEnabledByDefault: true,
      checkinAiAnalysisEnabledByDefault: false,
      calendarShowEventIcons: true,
      calendarShowGoalIcons: true,
      calendarShowMood: true,
      calendarShowEventIconsPast: false,
      calendarShowGoalIconsPast: false,
      calendarEventIconsFutureRange: CalendarIconFutureRange.ALL,
      calendarGoalIconsFutureRange: CalendarIconFutureRange.ALL,
      diaryTabEnabled: false,
      diaryTabVariant: DiaryTabVariant.CALENDAR_ONLY,
    });

    const aiPreferences = await this.aiPreferencesService.ensureDefaults(
      savedUser.id,
    );

    if (isFirstInstall && planData) {
      await this.plansService.subscribePlan(savedUser.id, planData);
    }

    savedUser.settings = await this.usersSettingsRepository.save(settings);
    savedUser.aiPreferences = aiPreferences;

    await this.usersRepository.save(savedUser);

    return await this.authService.loginByUUID(
      uuid,
      devicePubKey,
      isFirstInstall,
      deviceId ?? undefined,
      userAgent,
      ip,
    );
  }

  async syncUser(
    purchaseToken: string,
    devicePubKey: string,
    deviceId: string | null,
    appVersion: string,
    appBuild: number,
    platform: Platform,
    model: string,
    osVersion: string,
    osBuildId: string,
    uniqueId: string | null,
    userAgent?: string | null,
    ip?: string | null,
  ): Promise<{
    accessToken: string;
    user: User | null;
  }> {
    this.assertDevicePubKey(devicePubKey);

    const isFirstInstall: boolean = false;

    await this.claimFirstDeviceInstall(uniqueId);

    const storeSubscription =
      await this.subscriptionsService?.findStoreSubscriptionOwnerByPurchaseToken(
        purchaseToken,
      );
    const plan = storeSubscription?.userId
      ? null
      : await this.plansService.findExistingPlanForIap(purchaseToken);

    if (!storeSubscription?.userId && !plan) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Plan not found',
        "'Plan not found",
        'PLAN_NOT_FOUND',
      );
    }

    const ownerUserId = storeSubscription?.userId ?? plan!.user.id;
    const user = await this.findById(ownerUserId);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    const settings = await this.usersSettingsRepository.findOne({
      where: {
        user: { id: user.id },
      },
    });

    if (settings) {
      await this.usersSettingsRepository.update(settings.id, {
        appVersion,
        appBuild,
        platform,
        model,
        osVersion,
        osBuildId,
        uniqueId,
      });
    }

    return await this.authService.loginByUUID(
      user.uuid,
      devicePubKey,
      isFirstInstall,
      deviceId ?? undefined,
      userAgent,
      ip,
    );
  }

  private assertDevicePubKey(pub: unknown) {
    if (typeof pub !== 'string' || pub.length < 10) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid device public key',
        'Invalid device key.',
        'INVALID_DEVICE_PUBKEY',
      );
    }

    const buf = Buffer.from(pub, 'base64');

    if (buf.length !== 32) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid device public key length',
        'Invalid device key.',
        'INVALID_DEVICE_PUBKEY_LEN',
      );
    }
  }

  async me(
    uuid: string,
    hash: string,
  ): Promise<{
    user: User | null;
    plan: Plan | null;
    settings: UserSettings | null;
    aiPreferences: AiPrefsPayload | null;
  }> {
    const user = await this.usersRepository.findOne({
      where: { uuid },
    });

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }

    const salt = await this.saltService.getSaltByUserId(user.id);
    const hashToCompare = generateHash(uuid, salt!.value);

    if (hash !== hashToCompare) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid hash',
        'The provided hash is invalid.',
        'INVALID_HASH',
      );
    }

    const { plan } = await this.plansService.getActualByUserId(user.id);

    const settings = await this.getUserSettings(user.id);

    const aiPreferences = await this.aiPreferencesService.getForUser(user.id);

    return {
      user,
      plan,
      settings,
      aiPreferences,
    };
  }

  async getOneBy(userId: number | null, email?: string, uuid?: string) {
    if (userId) {
      const user = await this.findById(userId, [
        'settings',
        'sessions',
        'dialogsStats',
        'entriesStats',
        'checkinsStats',
        'checkinDialogsStats',
        'supportMessages',
        'tokenUsageHistory',
        'payments',
        'aiModelAnswerReview',
        'positiveNegativeAiModelAnswers',
      ]);

      if (!user) return null;

      const plan = await this.plansService.getActualByUserId(user.id);

      return {
        ...user,
        ...plan,
      };
    }

    if (email) {
      const user = await this.findByEmail(email, [
        'settings',
        'sessions',
        'dialogsStats',
        'entriesStats',
        'checkinsStats',
        'checkinDialogsStats',
        'supportMessages',
        'tokenUsageHistory',
        'payments',
        'aiModelAnswerReview',
        'positiveNegativeAiModelAnswers',
      ]);

      if (!user) return null;

      const plan = await this.plansService.getActualByUserId(user.id);

      return {
        ...user,
        ...plan,
      };
    }

    if (uuid) {
      const user = await this.findByUUID(uuid, [
        'settings',
        'sessions',
        'dialogsStats',
        'entriesStats',
        'checkinsStats',
        'checkinDialogsStats',
        'supportMessages',
        'tokenUsageHistory',
        'payments',
        'aiModelAnswerReview',
        'positiveNegativeAiModelAnswers',
      ]);

      if (!user) return null;

      const plan = await this.plansService.getActualByUserId(user.id);

      return {
        ...user,
        ...plan,
      };
    }

    return null;
  }

  async getUsersWithStats(params: {
    page?: number;
    limit?: number;
    sortBy?: SortBy;
    hasPlan?: HasPlan;
    registrationRange?: RegistrationRange;
    compact?: boolean;
    detailUserId?: number;
  }): Promise<{
    users: any[];
    total: number;
    page: number;
    pageCount: number;
    limit: number;
  }> {
    const { page = 1, limit = 50, sortBy = 'entry', hasPlan = 'All' } = params;

    const safeLimit = Math.max(limit ?? 50, 1);
    const safePage = Math.max(page ?? 1, 1);

    const baseQb = this.usersRepository.createQueryBuilder('u');
    if (params.compact) {
      const columns = params.detailUserId
        ? this.usersRepository.metadata.columns
            .map((column) => column.propertyName)
            .filter((name) => !adminPrivateFields.has(name))
        : [
            'id',
            'uuid',
            'name',
            'email',
            'regionCode',
            'createdAt',
            'lastActiveAt',
            'usesWithoutSubscription',
            'acquisitionSource',
            'acquisitionMetaJson',
          ];
      baseQb.select(columns.map((name) => `u.${name}`));
      if (params.detailUserId) {
        baseQb.andWhere('u.id = :detailUserId', {
          detailUserId: params.detailUserId,
        });
        baseQb.leftJoinAndSelect('u.settings', 's');
      }
      baseQb.loadRelationCountAndMap('u.goalsStatsCount', 'u.goalsStats');
    } else {
      baseQb
        .leftJoinAndSelect('u.settings', 's')
        .leftJoinAndSelect('u.payments', 'p')
        .leftJoinAndSelect('u.goalsStats', 'g');
    }
    if (params.registrationRange)
      filterRegistrations(baseQb, params.registrationRange);
    baseQb
      .leftJoinAndMapOne(
        'u.subscriptionState',
        UserPlanState,
        'ups',
        'ups.userId = u.id',
      )
      .leftJoinAndSelect('u.plans', 'ap', 'ap.actual = true');

    if (hasPlan === true) {
      baseQb.andWhere(
        `
        (
          (
            ups.id IS NOT NULL
            AND ups.basePlanId IS NOT NULL
            AND (ups.useWithoutSubscription = false OR ups.useWithoutSubscription IS NULL)
          )
          OR (
            ups.id IS NULL
            AND ap.id IS NOT NULL
          )
        )
      `,
      );
    } else if (hasPlan === false) {
      baseQb.andWhere(
        `
        (
          (
            ups.id IS NULL
            AND ap.id IS NULL
          )
          OR (
            ups.id IS NOT NULL
            AND (
              ups.basePlanId IS NULL
              OR ups.useWithoutSubscription = true
            )
          )
        )
      `,
      );
    }

    if (sortBy === 'lastActiveAt') {
      baseQb
        .andWhere('u.lastActiveAt IS NOT NULL')
        .andWhere('DATE(u.lastActiveAt) <> DATE(u.createdAt)');
    }

    baseQb
      .addSelect((sq) => {
        return sq
          .select('COUNT(1)', 'cnt')
          .from(DialogsStat, 'ds')
          .where('ds.userId = u.id');
      }, 'dialogs_stats_count')
      .addSelect((sq) => {
        return sq
          .select('COUNT(1)', 'cnt')
          .from(EntriesStat, 'es')
          .where('es.userId = u.id');
      }, 'entries_stats_count')
      .addSelect((sq) => {
        return sq
          .select('COUNT(1)', 'cnt')
          .from(CheckinsStat, 'cs')
          .where('cs.userId = u.id');
      }, 'checkins_stats_count')
      .addSelect((sq) => {
        return sq
          .select('COUNT(1)', 'cnt')
          .from(CheckinDialogsStat, 'cds')
          .where('cds.userId = u.id');
      }, 'checkin_dialogs_stats_count');

    if (params.compact) {
      for (const [entity, alias] of [
        [EntriesStat, 'entries_analysis'],
        [CheckinsStat, 'checkins_analysis'],
      ] as const) {
        baseQb.addSelect(
          (sq) =>
            sq
              .select(
                `json_build_object(
              'withAnalysis', COUNT(*) FILTER (WHERE s.hasAiAnalysis IS TRUE),
              'withoutAnalysis', COUNT(*) FILTER (WHERE s.hasAiAnalysis IS FALSE),
              'unknown', COUNT(*) FILTER (WHERE s.hasAiAnalysis IS NULL)
            )`,
              )
              .from(entity, 's')
              .where('s.userId = u.id'),
          alias,
        );
      }
    }

    const sortSpec: { expr: string; needsNullsLast?: boolean } =
      sortBy === 'createdAt'
        ? { expr: 'u.createdAt' }
        : sortBy === 'lastActiveAt'
          ? { expr: 'u.lastActiveAt', needsNullsLast: true }
          : sortBy === 'entry'
            ? { expr: 'entries_stats_count' }
            : { expr: 'dialogs_stats_count' };

    const listQb = baseQb.clone();
    if (sortSpec.needsNullsLast)
      listQb.orderBy(sortSpec.expr, 'DESC', 'NULLS LAST');
    else listQb.orderBy(sortSpec.expr, 'DESC');

    listQb
      .addOrderBy('u.id', 'DESC')
      .take(safeLimit)
      .skip((safePage - 1) * safeLimit);

    const { entities, raw } = await listQb.getRawAndEntities();

    const total = await baseQb.clone().select('u.id').distinct(true).getCount();

    // Aggregate only this page. Joining raw planner rows to payments/goals would
    // multiply counts. Null creation dates are saved-only branches/tombstones.
    const plannerRows = entities.length
      ? await this.usersRepository.manager
          .getRepository(PlannerCreationStat)
          .createQueryBuilder('pcs')
          .select('pcs.userId', 'userId')
          .addSelect('pcs.type', 'type')
          .addSelect('COUNT(pcs.createdAt)', 'count')
          .where('pcs.userId IN (:...userIds)', {
            userIds: entities.map((user) => user.id),
          })
          .groupBy('pcs.userId')
          .addGroupBy('pcs.type')
          .getRawMany<{
            userId: string | number;
            type: PlannerType;
            count: string;
          }>()
      : [];
    const plannerCountsByUserId = new Map<
      number,
      Partial<Record<PlannerType, number>>
    >();
    for (const row of plannerRows) {
      const userId = Number(row.userId);
      const counts = plannerCountsByUserId.get(userId) ?? {};
      counts[row.type] = Number(row.count);
      plannerCountsByUserId.set(userId, counts);
    }

    const countsByUserId = new Map<
      number,
      {
        d: number;
        e: number;
        c: number;
        cd: number;
        entriesAnalysis?: {
          withAnalysis: number;
          withoutAnalysis: number;
          unknown: number;
        };
        checkinsAnalysis?: {
          withAnalysis: number;
          withoutAnalysis: number;
          unknown: number;
        };
      }
    >();

    const typedRaw = raw as Array<{
      u_id: number | string;
      dialogs_stats_count?: number | string | null;
      entries_stats_count?: number | string | null;
      checkins_stats_count?: number | string | null;
      checkin_dialogs_stats_count?: number | string | null;
      entries_analysis?: {
        withAnalysis: number;
        withoutAnalysis: number;
        unknown: number;
      };
      checkins_analysis?: {
        withAnalysis: number;
        withoutAnalysis: number;
        unknown: number;
      };
    }>;

    for (const r of typedRaw) {
      const id = Number(r['u_id']);
      countsByUserId.set(id, {
        d: Number(r['dialogs_stats_count'] ?? 0),
        e: Number(r['entries_stats_count'] ?? 0),
        c: Number(r['checkins_stats_count'] ?? 0),
        cd: Number(r['checkin_dialogs_stats_count'] ?? 0),
        entriesAnalysis: r.entries_analysis,
        checkinsAnalysis: r.checkins_analysis,
      });
    }

    const users = entities.map(
      (u: UserWithSubscriptionState & { plans?: Plan[] }) => {
        const c = countsByUserId.get(u.id) ?? { d: 0, e: 0, c: 0, cd: 0 };

        const subscriptionState = u.subscriptionState ?? null;
        const activePlan = subscriptionState
          ? this.mapSubscriptionStateToLegacyPlan(subscriptionState)
          : (u.plans?.[0] ?? null);

        return {
          ...u,
          dialogsStatsCount: c.d,
          entriesStatsCount: c.e,
          checkinsStatsCount: c.c,
          checkinDialogsStatsCount: c.cd,
          ...(params.compact
            ? {
                entriesAnalysis: c.entriesAnalysis,
                checkinsAnalysis: c.checkinsAnalysis,
              }
            : {}),
          plannerCreatedCounts: Object.fromEntries(
            PLANNER_TYPES.map((type) => [
              type,
              plannerCountsByUserId.get(u.id)?.[type] ?? 0,
            ]),
          ),
          plan: activePlan,
          plans: undefined,
          subscriptionState: undefined,
          usesWithoutSubscription:
            subscriptionState?.useWithoutSubscription ??
            u.usesWithoutSubscription,
          payments: u.payments,
        };
      },
    );

    return {
      users: params.compact ? publicAdminData(users) : users,
      total,
      page: safePage,
      pageCount: Math.max(1, Math.ceil(total / safeLimit)),
      limit: safeLimit,
    };
  }

  getAdminUserOverview() {
    return getAdminUserOverview(this.usersRepository);
  }

  async getAdminNewUsers(
    from: string,
    to: string,
    page?: string,
    limit?: string,
  ) {
    const safePage = positiveInteger(page, 1);
    const safeLimit = positiveInteger(limit, 200);
    if (!Number.isSafeInteger(safePage * safeLimit))
      throw new BadRequestException('Завеликий номер сторінки.');
    return this.getUsersWithStats({
      registrationRange: registrationRange(from, to),
      page: safePage,
      limit: safeLimit,
      sortBy: 'createdAt',
      compact: true,
    });
  }

  async getAdminUserDetails(id: string) {
    const result = await this.getUsersWithStats({
      detailUserId: positiveInteger(id, 1),
      page: 1,
      limit: 1,
      sortBy: 'createdAt',
      compact: true,
    });
    const user = result.users[0] as Record<string, unknown> | undefined;
    if (!user) return null;
    // Payment history is fetched only for an expanded user, separately from
    // other relations so their row counts cannot multiply one another.
    const history = await this.usersRepository.findOne({
      where: { id: positiveInteger(id, 1) },
      select: { id: true },
      relations: { payments: true },
      relationLoadStrategy: 'query',
    });
    const purchasedCredits = this.creditWalletService
      ? await this.creditWalletService.getSummary(positiveInteger(id, 1))
      : null;
    return publicAdminData({
      ...user,
      payments: history?.payments ?? [],
      purchasedCredits,
    });
  }

  async getAdminNewUsersDays(from: string, to: string) {
    const range = registrationRange(from, to);
    const qb = filterRegistrations(
      this.usersRepository.createQueryBuilder('u'),
      range,
    );
    const evidence = [
      EntriesStat,
      DialogsStat,
      CheckinsStat,
      CheckinDialogsStat,
      GoalsStat,
      PlannerCreationStat,
    ]
      .map((entity, index) => {
        const alias = `e${index}`;
        const sq = qb
          .subQuery()
          .select('1')
          .from(entity, alias)
          .where(`${alias}.${entity === GoalsStat ? 'user' : 'userId'} = u.id`);
        if (entity === PlannerCreationStat)
          sq.andWhere(`${alias}.createdAt IS NOT NULL`);
        return `EXISTS ${sq.getQuery()}`;
      })
      .join(' OR ');
    const day = `TO_CHAR((u.createdAt AT TIME ZONE 'UTC') AT TIME ZONE :zone, 'YYYY-MM-DD')`;
    const rows = await qb
      .select(day, 'date')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN ${evidence} THEN 1 ELSE 0 END)`, 'withAction')
      .setParameter('zone', ADMIN_TIMEZONE)
      .groupBy(day)
      .orderBy(day, 'ASC')
      .getRawMany<{ date: string; total: string; withAction: string }>();
    const byDay = new Map(rows.map((row) => [row.date, row]));
    const days: {
      date: string;
      total: number;
      withAction: number;
      withoutAction: number;
    }[] = [];
    for (
      const date = new Date(`${from}T00:00:00Z`);
      date.toISOString().slice(0, 10) <= to;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const key = date.toISOString().slice(0, 10);
      const row = byDay.get(key);
      const total = Number(row?.total ?? 0);
      const withAction = Number(row?.withAction ?? 0);
      days.push({
        date: key,
        total,
        withAction,
        withoutAction: total - withAction,
      });
    }
    return { days, timezone: ADMIN_TIMEZONE };
  }

  async findByEmail(
    email: User['email'],
    relations: any[] = [],
  ): Promise<User | null> {
    if (!email) return null;
    return await this.usersRepository.findOne({
      where: { email },
      relations: relations,
    });
  }

  private mapSubscriptionStateToLegacyPlan(state: UserPlanState | null) {
    if (!state || state.basePlanId === null || state.useWithoutSubscription) {
      return null;
    }

    return {
      id: state.legacyPlanId ?? state.id,
      basePlanId: state.basePlanId,
      name: state.name,
      price: state.price,
      currency: state.currency,
      planStatus: state.accessStatus,
      billingStatus: state.billingStatus,
      accessStatus: state.accessStatus,
      startPayment: state.startTime,
      startTime: state.startTime,
      expiryTime: state.expiryTime,
      creditsLimit: state.creditsLimit,
      usedCredits: state.usedCredits,
      inputUsedCredits: state.inputUsedCredits,
      outputUsedCredits: state.outputUsedCredits,
      actual: true,
      useWithoutSubscription: state.useWithoutSubscription,
      currentStoreSubscriptionId: state.currentStoreSubscriptionId,
      legacyPlanId: state.legacyPlanId,
      metadata: state.metadata,
    };
  }

  async findByNewEmail(
    newEmail: string,
    relations: any[] = [],
  ): Promise<User | null> {
    if (!newEmail) return null;
    return await this.usersRepository.findOne({
      where: { newEmail },
      relations: relations,
    });
  }

  async findById(id: number, relations: any[] = []): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { id },
      relations: relations,
    });
  }

  async findByRole(role: Role, relations: any[] = []): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { role },
      relations: relations,
    });
  }

  async findByUUID(uuid: string, relations: any[] = []): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { uuid },
      relations: relations,
    });
  }

  async findByIdAndUUID(
    id: number,
    uuid: string,
    relations: any[] = [],
  ): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { id, uuid },
      relations: relations,
    });
  }

  async getUserSettings(userId: number): Promise<UserSettings | null> {
    const settings = await this.usersSettingsRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!settings) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User settings not found',
        'User settings not found',
        'USER_SETTINGS_NOT_FOUND',
      );
      return null;
    }

    const normalizedAiModel = normalizeAiModel(settings.aiModel);
    if (settings.aiModel !== normalizedAiModel) {
      settings.aiModel = normalizedAiModel;
      await this.usersSettingsRepository.save({
        id: settings.id,
        aiModel: normalizedAiModel,
      });
    }

    return settings;
  }

  async verifyUser(
    email: User['email'],
    password: string,
    hash?: string,
  ): Promise<User | null> {
    const user = await this.findByEmail(email);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    if (hash !== user.hash) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid hash',
        'The provided hash is invalid.',
        'INVALID_HASH',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password as string,
    );

    if (!isPasswordValid) {
      throwError(
        HttpStatus.UNAUTHORIZED,
        'Invalid password',
        'Invalid password',
        'INVALID_PASSWORD',
      );
    }

    return user;
  }

  async changeUserAuthData(
    email: string,
    changeUserAuthDataDto: ChangeUserAuthDataDto,
  ) {
    const { password, hash, ...rest } = changeUserAuthDataDto;

    const user = await this.verifyUser(email, password, hash);
    const data: Partial<User> = {};

    if (rest.newPassword) {
      data.password = await bcrypt.hash(rest.newPassword, 10);
    }

    let status: 'COOLDOWN' | 'SENT' = 'SENT';
    let retryAfterSec: number | undefined = undefined;
    if (rest.newEmail) {
      const existingUser = await this.findByEmail(rest.newEmail);

      if (existingUser && existingUser.id !== user!.id) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User already exists',
          'USER_ALREADY_EXISTS',
          'USER_ALREADY_EXISTS',
        );
      }

      data.newEmail = rest.newEmail;

      const {
        status: st,
        code,
        retryAfterSec: ra,
      } = await this.codeCore.send('email_change', { email: email });

      if (st === 'COOLDOWN') {
        status = st;
        retryAfterSec = ra;

        return { user: null, status, retryAfterSec };
      }

      const lang = rest.lang || 'en';
      await this.emailsService.send(
        [rest.newEmail],
        lang === 'en' ? emailChangeSubject.en : emailChangeSubject.uk,
        lang === 'en' ? '/auth/email-change-en' : '/auth/email-change-uk',
        { code },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repo = this.usersRepository as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await repo.update(user!.id, data);
    const updatedUser = await this.usersRepository.findOne({
      where: { id: user!.id },
    });

    return { user: updatedUser, status, retryAfterSec };
  }

  // async changeUser(changeUserDto: ChangeUserDto) {
  //   const { uuid, hash, ...rest } = changeUserDto;
  //   const user = await this.findByUUID(uuid);
  //
  //   if (!user) {
  //     throwError(
  //       HttpStatus.NOT_FOUND,
  //       'User not found',
  //       'User with this UUID does not exist.',
  //       'USER_NOT_FOUND',
  //     );
  //   }
  //
  //   const salt = await this.saltService.getSaltByUserId(user.id);
  //   const hashToCompare = generateHash(uuid, salt!.value);
  //
  //   if (hash !== hashToCompare) {
  //     throwError(
  //       HttpStatus.UNAUTHORIZED,
  //       'Invalid hash',
  //       'The provided hash is invalid.',
  //       'INVALID_HASH',
  //     );
  //   }
  //   const data: Partial<User> = {};
  //
  //   if (rest.newName) {
  //     data.name = rest.newName;
  //   }
  //
  //   await this.usersRepository.update(user.id, data);
  //   return await this.usersRepository.findOne({
  //     where: { id: user.id },
  //   });
  // }

  // Recheck the guest condition in the write: email confirmation or Google
  // registration can race a request that previously read an anonymous profile.
  async updateRegistrationGuest(
    guest: User,
    data: Pick<
      Partial<User>,
      | 'email'
      | 'password'
      | 'oauthProvider'
      | 'oauthProviderId'
      | 'isRegistered'
      | 'isLogged'
      | 'emailVerified'
    >,
  ): Promise<User> {
    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set(data)
      .where('id = :id AND uuid = :uuid', { id: guest.id, uuid: guest.uuid })
      .andWhere('"isRegistered" = false AND "emailVerified" = false')
      .andWhere('"oauthProvider" IS NULL AND "oauthProviderId" IS NULL')
      .andWhere('email IS NOT DISTINCT FROM :email', { email: guest.email })
      .execute();
    if (result.affected !== 1) {
      throwError(
        HttpStatus.CONFLICT,
        'Registration state changed',
        'The profile changed. Please sign in or retry registration.',
        'REGISTRATION_ACCOUNT_ALREADY_REGISTERED',
      );
    }
    return (await this.findById(guest.id))!;
  }

  async update(
    uuid: string,
    updateUserDto: Partial<User> & { appVersion?: string; appBuild?: number },
  ): Promise<{ user: User }> {
    const { hash, appVersion, appBuild, ...rest } = updateUserDto;
    try {
      const user = await this.findByUUID(uuid);

      if (!user) {
        throwError(
          HttpStatus.NOT_FOUND,
          'User not found',
          'User with this UUID does not exist.',
          'USER_NOT_FOUND',
        );
      }

      const salt = await this.saltService.getSaltByUserId(user.id);
      const hashToCompare = generateHash(uuid, salt!.value);

      if (hash !== hashToCompare) {
        throwError(
          HttpStatus.UNAUTHORIZED,
          'Invalid hash',
          'The provided hash is invalid.',
          'INVALID_HASH',
        );
      }

      if ('lastActiveAt' in rest && rest.lastActiveAt) {
        await this.userStatisticsService.ensureUserActivityStat(
          user.id,
          new Date(rest.lastActiveAt),
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const repo = this.usersRepository as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,  @typescript-eslint/no-unsafe-member-access
      const res = await repo.update(user.id, rest);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!res.affected) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Error updating user',
          'Error updating user',
          'USER_UPDATE_ERROR',
        );
      }

      if (appVersion && appBuild) {
        await this.usersSettingsRepository.update(
          { user: { id: user.id } },
          { appVersion, appBuild },
        );
      }

      const updatedUser = await this.usersRepository.findOne({
        where: { id: user.id },
      });

      if (!updatedUser) {
        throwError(
          HttpStatus.NOT_FOUND,
          'User not found after update',
          'User not found after update',
          'USER_NOT_FOUND_AFTER_UPDATE',
        );
      }

      if ('usesWithoutSubscription' in rest) {
        await this.syncSubscriptionUseWithoutFlag(
          user.id,
          Boolean(rest.usesWithoutSubscription),
        );
      }

      return {
        user: updatedUser,
      };
    } catch (error: any) {
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'User update error',
        'An error occurred while updating the user.',
        'USER_UPDATE_ERROR',
        error,
      );
    }
  }

  private async syncSubscriptionUseWithoutFlag(
    userId: number,
    usesWithoutSubscription: boolean,
  ): Promise<void> {
    if (!this.subscriptionsService) {
      return;
    }

    try {
      const { plan } = await this.plansService.getActualByUserId(userId);
      await this.subscriptionsService.syncLegacyPlanToUserPlanState(
        userId,
        plan,
      );
    } catch {
      // Preserve the existing best-effort legacy subscription synchronization.
    }
  }

  async updateByIdAndUuid(
    id: number,
    uuid: string,
    updateUserDto: Partial<User>,
  ): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id, uuid });

    const { plans, settings, ...rest } = updateUserDto;

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User with this ID and UUID does not exist.',
        'USER_NOT_FOUND',
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const repo = this.usersRepository as any;

    if (
      'usesWithoutSubscription' in rest ||
      'subscriptionRuntime' in rest ||
      'plans' in updateUserDto
    ) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Subscription fields are not allowed here',
        'Subscription fields must be updated through subscription APIs.',
        'SUBSCRIPTION_FIELDS_NOT_ALLOWED',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await repo.update(user.id, rest);
    return await this.usersRepository.findOne({
      where: { id: user.id },
    });
  }

  async updateUserSettings(
    userId: number,
    updateUserSettingsDto: Partial<UserSettings> & { initializeThemeSelection?: boolean },
  ): Promise<UserSettings | null> {
    const settings = await this.usersSettingsRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!settings) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User settings not found',
        'User settings not found',
        'USER_SETTINGS_NOT_FOUND',
      );
    }

    const safeSettingsUpdate = { ...updateUserSettingsDto };
    const initializeThemeSelection = safeSettingsUpdate.initializeThemeSelection === true;
    delete safeSettingsUpdate.initializeThemeSelection;
    const themeSelection = safeSettingsUpdate.themeSelection === undefined
      ? undefined : validateThemeSelection(safeSettingsUpdate.themeSelection);
    delete safeSettingsUpdate.themeSelection;
    const onboardingVariant = safeSettingsUpdate.onboardingVariant;
    if (
      onboardingVariant != null &&
      ![
        'journal-collage',
        'pastel-refined',
        'quick-start',
        'direct-entry',
      ].includes(onboardingVariant)
    ) {
      throw new BadRequestException('Invalid onboarding variant');
    }
    // This attribution is write-once, including concurrent requests/devices.
    // Never let ordinary settings saves write a stale copy of this column.
    delete safeSettingsUpdate.onboardingVariant;
    if (
      'checkinAiAnalysisEnabledByDefault' in safeSettingsUpdate &&
      typeof safeSettingsUpdate.checkinAiAnalysisEnabledByDefault !== 'boolean'
    ) {
      throw new BadRequestException('Invalid check-in AI analysis default');
    }
    // Freeze the old shared preference before changing the entry preference.
    // This also protects users whose row has not been backfilled yet.
    if (
      settings?.checkinAiAnalysisEnabledByDefault == null &&
      'aiAnalysisEnabledByDefault' in safeSettingsUpdate &&
      !('checkinAiAnalysisEnabledByDefault' in safeSettingsUpdate)
    ) {
      safeSettingsUpdate.checkinAiAnalysisEnabledByDefault =
        settings?.aiAnalysisEnabledByDefault ?? true;
    }
    delete safeSettingsUpdate.diaryTabVariant;
    if ('metricTracking' in safeSettingsUpdate) {
      safeSettingsUpdate.metricTracking = validateMetricTracking(
        safeSettingsUpdate.metricTracking,
        settings?.metricTracking,
      );
    }
    if ('checkinSettings' in safeSettingsUpdate) {
      safeSettingsUpdate.checkinSettings = validateCheckinSettings(
        safeSettingsUpdate.checkinSettings,
        safeSettingsUpdate.metricTracking ?? settings?.metricTracking,
      );
    }
    if ('aiModel' in safeSettingsUpdate) {
      safeSettingsUpdate.aiModel = normalizeAiModel(safeSettingsUpdate.aiModel);
    }

    if (
      'entryMediaAnalysisMode' in safeSettingsUpdate &&
      !['ask', 'always', 'never'].includes(
        safeSettingsUpdate.entryMediaAnalysisMode as string,
      )
    ) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid media analysis setting',
        'Expected ask, always or never.',
        'INVALID_ENTRY_MEDIA_ANALYSIS_MODE',
      );
    }
    const originalVariant = settings.onboardingVariant;
    const saved = Object.keys(safeSettingsUpdate).length
      ? await this.usersSettingsRepository.save({
          ...settings,
          ...safeSettingsUpdate,
          onboardingVariant: undefined,
          themeSelection: undefined,
        })
      : settings;
    // Write only this column, so concurrent font/language saves cannot restore a stale theme.
    if (themeSelection !== undefined) {
      await this.usersSettingsRepository.update(
        { id: settings.id, ...(initializeThemeSelection ? { themeSelection: IsNull() } : {}) },
        { themeSelection },
      );
    }
    if (onboardingVariant != null) {
      await this.usersSettingsRepository.update(
        { id: settings.id, onboardingVariant: IsNull() },
        { onboardingVariant },
      );
      return this.usersSettingsRepository.findOne({
        where: { user: { id: userId } },
      });
    }
    if (themeSelection !== undefined) {
      return this.usersSettingsRepository.findOne({ where: { user: { id: userId } } });
    }
    return { ...saved, onboardingVariant: originalVariant, themeSelection: settings.themeSelection };
  }

  async sendVerificationCodeForDelete(
    email: string,
  ): Promise<SendDeleteCodeResult> {
    const user = await this.findByEmail(email);

    if (!user) {
      await sleep(200 + Math.random() * 200);
      return { status: 'SENT' };
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      'delete_account',
      { email: email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    const lang = user.settings?.lang || 'en';

    await this.emailsService.send(
      [user.email as string],
      lang === Lang.EN
        ? 'Code to delete account'
        : 'Код для видалення облікового запису',
      lang === Lang.EN ? '/auth/delete-account-en' : '/auth/delete-account-uk',
      {
        code: code,
      },
    );

    return { status: 'SENT' };
  }

  async sendVerificationCodeForResetPin(
    email: string,
  ): Promise<SendDeleteCodeResult> {
    const user = await this.findByEmail(email);

    if (!user) {
      await sleep(200 + Math.random() * 200);
      return { status: 'SENT' };
    }

    const { status, code, retryAfterSec } = await this.codeCore.send(
      'reset_pin',
      { email: email },
    );
    if (status === 'COOLDOWN') return { status, retryAfterSec };

    const lang = user.settings?.lang || 'en';

    await this.emailsService.send(
      [user.email as string],
      lang === Lang.EN ? 'Code to reset PIN' : 'Код для скидання PIN-коду',
      lang === Lang.EN ? '/auth/reset-pin-en' : '/auth/reset-pin-uk',
      {
        code: code,
      },
    );

    return { status: 'SENT' };
  }

  async checkCodeForResetPin(email: string, code: string): Promise<boolean> {
    const v = await this.codeCore.verify('reset_pin', { email: email }, code);

    if (v.status !== 'OK') {
      const msg =
        v.status === 'EXPIRED_CODE'
          ? 'The provided code has expired.'
          : v.status === 'ATTEMPTS_EXCEEDED'
            ? 'Maximum attempts exceeded.'
            : 'The provided code is invalid.';
      throwError(HttpStatus.BAD_REQUEST, 'Invalid code', msg, v.status);
    }

    return v.status === 'OK';
  }

  async deleteAccountByVerificationCode(
    email: string,
    code: string,
  ): Promise<VerifyDeleteCodeResult> {
    const v = await this.codeCore.verify(
      'delete_account',
      { email: email },
      code,
    );
    if (v.status !== 'OK') {
      const msg =
        v.status === 'EXPIRED_CODE'
          ? 'The provided code has expired.'
          : v.status === 'ATTEMPTS_EXCEEDED'
            ? 'Maximum attempts exceeded.'
            : 'The provided code is invalid.';
      throwError(HttpStatus.BAD_REQUEST, 'Invalid code', msg, v.status);
    }

    const user = await this.findByEmail(email);

    if (!user) {
      await sleep(250);
      return { status: 'INVALID_CODE' };
    }

    await this.deleteUser(user.id);

    const lang = user.settings?.lang || 'en';

    await this.emailsService.send(
      [user.email as string],
      lang === Lang.EN ? 'Account deleted' : 'Акаутн видалено',
      lang === Lang.EN
        ? '/auth/account-deleted-en'
        : '/auth/account-deleted-uk',
    );
    return { status: 'OK' };
  }

  async deleteUser(id: number): Promise<void> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    await this.tokensService.deleteByUserId(user.id);

    await this.plansService.deleteByUserId(user.id);

    await this.saltService.deleteSaltByUserId(user.id);

    await this.sessionsService.deleteByUserId(user.id);

    await this.commonNotificationsService.deleteReadNotificationsByUserId(
      user.id,
    );
    await this.releaseNotificationsService.deleteSkippedVersionsByUserId(
      user.id,
    );
    await this.usersSettingsRepository.delete({ user: { id: user.id } });

    await this.usersRepository.delete(id);
  }

  async deleteUserByUuid(uuid: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { uuid } });

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    await this.deleteUser(user.id);
  }

  async deleteAnonymousUserByUuid(uuid: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { uuid } });

    if (!user || !this.canDeleteAsAnonymous(user)) {
      return false;
    }

    const hasLegacyPaidPlan = await this.plansService.hasPaidPlanByUserId(
      user.id,
    );

    if (hasLegacyPaidPlan) {
      return false;
    }

    const hasV2PaidSubscription =
      (await this.subscriptionsService?.hasPaidStoreSubscriptionForUser(
        user.id,
      )) ?? false;

    if (hasV2PaidSubscription) {
      return false;
    }

    await this.deleteUser(user.id);

    return true;
  }

  private canDeleteAsAnonymous(user: User): boolean {
    return (
      !user.isSystem &&
      !user.isRegistered &&
      !user.email &&
      !user.phone &&
      !user.oauthProvider &&
      !user.oauthProviderId &&
      !user.password
    );
  }
}
