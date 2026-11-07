/** The client executes these through its normal local planner services. */
export const PLANNER_CREATION_INSTRUCTIONS = `
PLANNER CREATIONS
When plannerCreationSupported=true, return plannerCreations (otherwise []). Extract ONLY explicit current user requests to create a goal, habit, task, event, checklist or note, or an unambiguous acceptance of a concrete proposal in the supplied exchange. Advice, wishes, quoted/historical/hypothetical text and assistant claims alone authorize nothing. Never change/delete existing planners. Missing essential details -> [] (the main response must clarify). Do not infer completion, notifications or links.
Each item: {kind:"goal|habit|task|event|checklist|note",title:"...",description:"...",startDate?:"YYYY-MM-DD",endDate?:"YYYY-MM-DD",time?:"HH:mm",frequency?:"daily|weekly|monthly|yearly",target?:number,unit?:"times|minutes|hours|km|pages|custom",items?:["..."],milestones?:[{title:"...",dueDate:"YYYY-MM-DD"}],comparator?:"at_least|at_most",customUnitLabel?:"..."}. Choose a single kind. Preserve the user's exact intent and dates; resolve relatives from supplied local time. No fabricated deadlines. Goal requires endDate. Requested goal stages MUST be milestones with each user's own deadline; never replace stages with description/items, copy the goal deadline, or save a partial goal. Missing any stage date -> omit that goal and clarify before creating it. Dates supplied in reply to the preceding clarification complete the original request. Stage dates must fall within the goal's specified dates. Event requires startDate; habit requires daily/weekly frequency and target >= 0 for at_most, otherwise target > 0 (once per period if explicitly implied); checklist.items: 1–50 strings; copy the authorized list verbatim in order (user-specified, otherwise assistant-composed when requested), without omissions, merging or rewriting; over limit omit the whole checklist; note requires the full content in description. Task and note descriptions preserve paragraphs and support **bold**, bullet and numbered lists. Task without a date is allowed. Habit target is per day/week. Preserve named units: quantities outside the unit enum (e.g. cups/glasses) require unit="custom" and customUnitLabel in the user language, never "times" or description-only units. At most 6 planners per request, not 6 checklist items. Unsupported detailed schedules, notifications or edits must be clarified rather than silently dropped. Never invent fields. Every array can be empty.
`;

export type PlannerCreation = {
  kind: 'goal' | 'habit' | 'task' | 'event' | 'checklist' | 'note';
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  time?: string;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  target?: number;
  unit?: 'times' | 'minutes' | 'hours' | 'km' | 'pages' | 'custom';
  customUnitLabel?: string;
  comparator?: 'at_least' | 'at_most';
  items?: string[];
  milestones?: { title: string; dueDate: string }[];
};

export function normalizePlannerCreations(value: unknown): PlannerCreation[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const a = raw as Record<string, unknown>;
    if (
      !['goal', 'habit', 'task', 'event', 'checklist', 'note'].includes(
        String(a.kind),
      ) ||
      typeof a.title !== 'string' ||
      !a.title.trim() ||
      a.title.length > 200
    )
      return [];
    const result: PlannerCreation = {
      kind: a.kind as PlannerCreation['kind'],
      title: a.title.trim(),
    };
    if (a.description !== undefined) {
      if (typeof a.description !== 'string' || a.description.length > 8000)
        return [];
      result.description = a.description.trim();
    }
    for (const field of ['startDate', 'endDate'] as const) {
      if (a[field] === undefined) continue;
      const day = a[field];
      if (typeof day !== 'string') return [];
      const date = new Date(`${day}T12:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== day
      )
        return [];
      result[field] = day;
    }
    if (result.startDate && result.endDate && result.endDate < result.startDate)
      return [];
    if (a.time !== undefined) {
      if (
        typeof a.time !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time) ||
        !result.startDate
      )
        return [];
      result.time = a.time;
    }
    if (a.frequency !== undefined) {
      if (
        typeof a.frequency !== 'string' ||
        !['daily', 'weekly', 'monthly', 'yearly'].includes(a.frequency)
      )
        return [];
      result.frequency = a.frequency as PlannerCreation['frequency'];
    }
    if (a.target !== undefined) {
      if (
        typeof a.target !== 'number' ||
        !Number.isFinite(a.target) ||
        a.target < 0 ||
        (a.target === 0 &&
          (a.kind !== 'habit' || a.comparator !== 'at_most')) ||
        a.target > 100000
      )
        return [];
      result.target = a.target;
    }
    if (a.unit !== undefined) {
      if (
        typeof a.unit !== 'string' ||
        !['times', 'minutes', 'hours', 'km', 'pages', 'custom'].includes(a.unit)
      )
        return [];
      result.unit = a.unit as PlannerCreation['unit'];
    }
    if (a.customUnitLabel !== undefined) {
      if (
        typeof a.customUnitLabel !== 'string' ||
        !a.customUnitLabel.trim() ||
        a.customUnitLabel.length > 40
      )
        return [];
      result.customUnitLabel = a.customUnitLabel.trim();
    }
    if (a.comparator !== undefined) {
      if (a.comparator !== 'at_least' && a.comparator !== 'at_most') return [];
      result.comparator = a.comparator;
    }
    if (result.unit === 'custom' && !result.customUnitLabel) return [];
    if (result.kind === 'habit' && result.time) return [];
    if (a.items !== undefined) {
      if (result.kind !== 'checklist') return [];
      if (
        !Array.isArray(a.items) ||
        a.items.length > 50 ||
        a.items.some(
          (x) => typeof x !== 'string' || !x.trim() || x.length > 300,
        )
      )
        return [];
      result.items = (a.items as string[]).map((x) => x.trim());
    }
    if (a.milestones !== undefined) {
      if (
        result.kind !== 'goal' ||
        !Array.isArray(a.milestones) ||
        a.milestones.length > 50
      )
        return [];
      const milestones: NonNullable<PlannerCreation['milestones']> = [];
      for (const rawStage of a.milestones) {
        if (
          !rawStage ||
          typeof rawStage !== 'object' ||
          Array.isArray(rawStage)
        )
          return [];
        const stage = rawStage as Record<string, unknown>;
        if (
          typeof stage.title !== 'string' ||
          !stage.title.trim() ||
          stage.title.length > 300 ||
          typeof stage.dueDate !== 'string'
        )
          return [];
        const date = new Date(`${stage.dueDate}T12:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(stage.dueDate) ||
          !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== stage.dueDate ||
          (result.startDate && stage.dueDate < result.startDate) ||
          (result.endDate && stage.dueDate > result.endDate)
        )
          return [];
        milestones.push({ title: stage.title.trim(), dueDate: stage.dueDate });
      }
      result.milestones = milestones;
    }
    if (
      (result.kind === 'goal' && !result.endDate) ||
      (result.kind === 'event' && !result.startDate) ||
      (result.kind === 'habit' &&
        (!['daily', 'weekly'].includes(result.frequency ?? '') ||
          result.target === undefined)) ||
      (result.kind === 'checklist' && !result.items?.length) ||
      (result.kind === 'note' && !result.description) ||
      (result.frequency && result.kind !== 'habit' && !result.startDate)
    )
      return [];
    return [result];
  });
}
