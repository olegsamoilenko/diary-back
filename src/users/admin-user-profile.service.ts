import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isEmail, isUUID } from 'class-validator';
import { DataSource, EntityMetadata } from 'typeorm';
import { User } from './entities/user.entity';
import { positiveInteger } from './admin-user-statistics';
import { UsersService } from './users.service';

const datasets = [
  ['user_settings', 'Налаштування'],
  ['user_ai_preferences', 'Налаштування ШІ'],
  ['user_plan_states', 'Поточний план V2'],
  ['store_subscriptions', 'Підписки магазину'],
  ['plans', 'Історія планів V1'],
  ['payments', 'Платежі'],
  ['paid_plan_events', 'Події підписок'],
  ['credit_wallets', 'Баланс куплених кредитів'],
  ['credit_ledger_entries', 'Операції гаманця кредитів'],
  ['credit_purchases', 'Покупки кредитів'],
  ['token_usage_history', 'Використання й списання кредитів ШІ'],
  ['user_sessions', 'Сесії'],
  ['user_push_tokens', 'Реєстрації push-пристроїв'],
  ['diary_notification_states', 'Стан сповіщень щоденника'],
  ['user_reminders', 'Нагадування'],
  ['user_read_notifications', 'Прочитані сповіщення'],
  ['user_skipped_versions', 'Пропущені версії'],
  ['entries_stats', 'Статистика записів'],
  ['dialogs_stats', 'Статистика діалогів'],
  ['checkins_stats', 'Статистика чекінів'],
  ['checkin_dialogs_stats', 'Статистика діалогів чекінів'],
  ['goals_stats', 'Статистика цілей'],
  ['planner_creation_stats', 'Створення планерів'],
  ['user_activity_stats', 'Активність застосунку'],
  ['ai_model_answer_reviews', 'Відгуки про відповіді ШІ'],
  ['positive_negative_ai_model_answers', 'Оцінки відповідей ШІ'],
  ['regenerate_ai_model_answers', 'Повторні генерації ШІ'],
  ['ai_media_assets', 'Обробка медіа ШІ'],
  ['user_monitoring', 'Спостереження'],
  ['support_messages', 'Звернення до підтримки'],
  ['forum_public_profiles', 'Профіль спільноти'],
  ['forum_user_access', 'Доступ до спільноти'],
  ['forum_monthly_usage', 'Ліміти спільноти'],
  ['forum_activity', 'Активність спільноти'],
  ['forum_topics', 'Теми'],
  ['forum_comments', 'Коментарі'],
  ['forum_reactions', 'Реакції'],
  ['forum_bookmarks', 'Закладки'],
  ['forum_views', 'Перегляди'],
  ['forum_topic_read_states', 'Прочитані теми'],
  ['forum_topic_watchers', 'Підписки на теми'],
  ['forum_mentions', 'Згадки'],
  ['forum_notifications', 'Сповіщення спільноти'],
  ['forum_conversations', 'Приватні розмови'],
  ['forum_messages', 'Метадані приватних повідомлень'],
  ['forum_reports', 'Скарги'],
  ['forum_user_blocks', 'Блокування у спільноті'],
  ['forum_user_restrictions', 'Обмеження у спільноті'],
  ['forum_moderation_logs', 'Журнал модерації'],
  ['forum_content_moderation_logs', 'Журнал модерації контенту'],
  ['forum_ai_moderation_results', 'Результати AI-модерації'],
  ['forum_translations', 'Переклади тем і коментарів'],
  ['forum_topic_translations', 'Переклади тем V1'],
] as const;

const contentTargets = [
  ['topic', 'forum_topics', 'author_id'],
  ['comment', 'forum_comments', 'author_id'],
  ['message', 'forum_messages', 'sender_id'],
] as const;
const pageSize = 50;

// These fields are excluded from SQL projection and from nested JSON.
function profileFieldAllowed(name: string) {
  const key = name.replace(/_/g, '').toLowerCase();
  return (
    !/(password|passphrase|secret|credential|authorization|encrypted|verificationcode|privatekey|devicepubkey|publickey|receipt|cookie|signature|hash|purchaseToken|refreshToken|accessToken|idToken|pushToken|apikey|obfuscatedaccountid)/i.test(
      key,
    ) &&
    ![
      'token',
      'salt',
      'rawstoredata',
      'rawresponsejson',
      'rawresponse',
      'requestheaders',
      'responseheaders',
    ].includes(key)
  );
}

function sanitizeProfileData(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return null;
  if (Array.isArray(value)) return value.map(sanitizeProfileData);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => profileFieldAllowed(key))
      .map(([key, item]) => [key, sanitizeProfileData(item)]),
  );
}

function lookupField(body: unknown) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Заповніть одне поле пошуку.');
  }
  const data = body as Record<string, unknown>;
  const fields = (['id', 'email', 'uuid'] as const)
    .map((field) => ({ field, value: data[field] }))
    .filter(({ value }) => value !== undefined && value !== '');
  if (fields.length !== 1 || typeof fields[0].value !== 'string') {
    throw new BadRequestException('Заповніть одне поле пошуку.');
  }
  const { field } = fields[0];
  const value = fields[0].value.trim();
  if (
    field === 'id' &&
    (!/^\d{1,10}$/.test(value) ||
      Number(value) < 1 ||
      Number(value) > 2147483647)
  ) {
    throw new BadRequestException('Вкажіть коректний ID користувача.');
  }
  if (field === 'email' && (value.length > 254 || !isEmail(value))) {
    throw new BadRequestException('Вкажіть коректний email.');
  }
  if (field === 'uuid' && !isUUID(value)) {
    throw new BadRequestException('Вкажіть коректний UUID.');
  }
  return { field, value };
}

@Injectable()
export class AdminUserProfileService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {}

  async search(body: unknown) {
    const { field, value } = lookupField(body);
    let id = Number(value);
    if (field !== 'id') {
      const users = await this.dataSource
        .getRepository(User)
        .createQueryBuilder('u')
        .select('u.id')
        .where(
          field === 'email' ? 'LOWER(u.email) = :value' : 'u.uuid = :value',
          { value: value.toLowerCase() },
        )
        .take(2)
        .getMany();
      if (users.length > 1) {
        throw new BadRequestException(
          'Цей email мають кілька профілів. Скористайтесь ID або UUID.',
        );
      }
      if (!users[0]) throw new NotFoundException('Користувача не знайдено.');
      id = users[0].id;
    }

    const [{ users }, profile] = await Promise.all([
      this.usersService.getUsersWithStats({
        detailUserId: id,
        sortBy: 'createdAt',
        page: 1,
        limit: 1,
        compact: true,
      }),
      this.readRows(this.dataSource.getMetadata(User), ['r.id = $1'], [id], 1),
    ]);
    if (!users[0] || !profile.rows[0]) {
      throw new NotFoundException('Користувача не знайдено.');
    }
    return {
      summary: sanitizeProfileData(users[0]),
      profile: profile.rows[0],
      datasets: datasets.map(([key, label]) => ({ key, label })),
    };
  }

  async records(id: number, key: string, rawPage?: string) {
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      throw new BadRequestException('Вкажіть коректний ID користувача.');
    }
    const dataset = datasets.find(([name]) => name === key);
    if (!dataset) throw new NotFoundException('Розділ даних не знайдено.');
    const page = positiveInteger(rawPage, 1);
    if (!Number.isSafeInteger((page - 1) * pageSize)) {
      throw new BadRequestException('Сторінка завелика.');
    }
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id },
      select: { id: true, uuid: true },
    });
    if (!user) throw new NotFoundException('Користувача не знайдено.');

    const metadata = this.dataSource.getMetadata(dataset[0]);
    const userMetadata = this.dataSource.getMetadata(User);
    const linkedColumns = metadata.foreignKeys
      .filter(
        (fk) =>
          fk.referencedEntityMetadata === userMetadata &&
          fk.columns.length === 1,
      )
      .map((fk) => fk.columns[0]);
    const scalarOwner = metadata.columns.find(
      (column) => column.propertyName === 'userId',
    );
    const ownerColumns = new Set(
      scalarOwner ? [...linkedColumns, scalarOwner] : linkedColumns,
    );
    const clauses = [...ownerColumns].map(
      (column) => `r.${this.escape(column.databaseName)} = $1`,
    );
    const params: (string | number)[] = [id];

    if (
      [
        'forum_reports',
        'forum_ai_moderation_results',
        'forum_translations',
      ].includes(key)
    ) {
      for (const [type, table, owner] of contentTargets) {
        if (key === 'forum_translations' && type === 'message') continue;
        params.push(key === 'forum_translations' ? `${type}_content` : type);
        clauses.push(
          `(r."target_type" = $${params.length} AND EXISTS (SELECT 1 FROM ${this.escape(table)} AS target
            WHERE target.${this.escape(owner)} = $1 AND target.id::text = r."target_id"::text))`,
        );
      }
    }
    if (key === 'forum_reports') {
      params.push(user.uuid);
      clauses.push(
        `(r."target_type" = 'user' AND r."target_id" IN ($1::int::text, $${params.length}))`,
      );
    }
    if (key === 'forum_topic_translations') {
      clauses.push(
        'EXISTS (SELECT 1 FROM "forum_topics" AS topic WHERE topic."author_id" = $1 AND topic.id = r."topic_id")',
      );
    }
    if (!clauses.length)
      throw new Error('Missing ownership for admin profile dataset');
    return this.readRows(metadata, clauses, params, page);
  }

  private escape(name: string) {
    return this.dataSource.driver.escape(name);
  }

  private async readRows(
    metadata: EntityMetadata,
    conditions: string[],
    params: (string | number)[],
    page: number,
  ) {
    const columns = [
      ...new Set(
        metadata.columns
          .filter(
            (column) =>
              (column.isSelect ||
                (metadata.target === User &&
                  column.propertyName === 'firstPageVisits')) &&
              !column.isVirtualProperty &&
              profileFieldAllowed(column.propertyName) &&
              profileFieldAllowed(column.databaseName) &&
              !(
                metadata.tableName === 'forum_messages' &&
                column.propertyName === 'content'
              ),
          )
          .map((column) => column.databaseName),
      ),
    ];
    const createdAt = metadata.createDateColumn?.databaseName;
    const order = [
      ...new Set([
        ...(createdAt ? [createdAt] : []),
        ...metadata.primaryColumns.map((column) => column.databaseName),
      ]),
    ]
      .map((name) => `r.${this.escape(name)} DESC`)
      .join(', ');
    const table = [metadata.schema, metadata.tableName]
      .filter((part): part is string => Boolean(part))
      .map((part) => this.escape(part))
      .join('.');
    const records = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT ${columns.map((name) => `r.${this.escape(name)}`).join(', ')}
       FROM ${table} r WHERE (${conditions.join(' OR ')})
       ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize + 1, (page - 1) * pageSize],
    );
    return {
      rows: records.slice(0, pageSize).map(sanitizeProfileData),
      page,
      hasNext: records.length > pageSize,
    };
  }
}
