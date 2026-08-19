import type { ProposedMemoryTagV2 } from '../types/memoryTagCatalogV2';

const domain = (
  key: string,
  label: string,
  description: string,
): ProposedMemoryTagV2 => ({
  key: `domain.${key}`,
  type: 'domain',
  label,
  description,
});
const state = (
  key: string,
  label: string,
  description: string,
): ProposedMemoryTagV2 => ({
  key: `state.${key}`,
  type: 'state',
  label,
  description,
});
const mechanism = (
  key: string,
  label: string,
  description: string,
): ProposedMemoryTagV2 => ({
  key: `mechanism.${key}`,
  type: 'mechanism',
  label,
  description,
});

export const MEMORY_TAG_CATALOG_V2_SEED: ProposedMemoryTagV2[] = [
  domain(
    'sleep',
    'Sleep',
    'Sleep quality, schedule, insomnia, rest and waking.',
  ),
  domain(
    'work',
    'Work',
    'Current work tasks, workload, colleagues and workplace situations.',
  ),
  domain(
    'career',
    'Career',
    'Career direction, professional growth, job changes and ambitions.',
  ),
  domain(
    'relationships',
    'Relationships',
    'Romantic or interpersonal relationships and recurring dynamics.',
  ),
  domain(
    'family',
    'Family',
    "Relationships and situations involving the user's family.",
  ),
  domain(
    'parenting',
    'Parenting',
    'Parenting, children, caregiving and family routines.',
  ),
  domain(
    'friendship',
    'Friendship',
    'Friendships, social connection and peer relationships.',
  ),
  domain(
    'health',
    'Health',
    'Physical health, symptoms, treatment and medical routines without diagnosis.',
  ),
  domain(
    'mental_health',
    'Mental health',
    'Emotional wellbeing, therapy and mental health support without diagnosis.',
  ),
  domain(
    'fitness',
    'Fitness',
    'General exercise, physical conditioning and movement.',
  ),
  domain(
    'running',
    'Running',
    'Running practice, endurance, races and running plans.',
  ),
  domain(
    'strength_training',
    'Strength training',
    'Resistance exercise, strength development and lifting plans.',
  ),
  domain(
    'nutrition',
    'Nutrition',
    'Food, eating patterns, cooking, hunger and nutrition goals.',
  ),
  domain(
    'finance',
    'Finance',
    'Budgeting, saving, debt, spending and financial planning.',
  ),
  domain(
    'learning',
    'Learning',
    'Learning skills, languages or subjects outside formal education.',
  ),
  domain(
    'education',
    'Education',
    'School, university, courses, exams and formal study.',
  ),
  domain(
    'creativity',
    'Creativity',
    'Creative practice, ideas, experimentation and creative blocks.',
  ),
  domain(
    'writing',
    'Writing',
    'Writing projects, drafting, editing and publishing.',
  ),
  domain(
    'art',
    'Art',
    'Visual art, illustration, design and artistic practice.',
  ),
  domain(
    'music',
    'Music',
    'Playing, composing, listening to or learning music.',
  ),
  domain(
    'photography',
    'Photography',
    'Photography practice, equipment, shoots and visual storytelling.',
  ),
  domain(
    'travel',
    'Travel',
    'Trips, travel planning, adaptation and travel experiences.',
  ),
  domain(
    'home',
    'Home',
    'Home environment, household tasks, repairs and living arrangements.',
  ),
  domain(
    'organization',
    'Organization',
    'Decluttering, organizing possessions and maintaining order.',
  ),
  domain(
    'productivity',
    'Productivity',
    'Task execution, attention, planning and sustainable output.',
  ),
  domain(
    'habits',
    'Habits',
    'Building, changing or maintaining recurring behavior.',
  ),
  domain(
    'mindfulness',
    'Mindfulness',
    'Present-moment awareness, meditation and reflective practices.',
  ),
  domain(
    'self_esteem',
    'Self-esteem',
    'Self-worth, confidence and relationship with oneself.',
  ),
  domain('grief', 'Grief', 'Loss, mourning and adjustment after loss.'),
  domain(
    'community',
    'Community',
    'Community participation, belonging and collective activities.',
  ),
  domain(
    'volunteering',
    'Volunteering',
    'Unpaid service, charitable work and helping communities.',
  ),
  domain(
    'spirituality',
    'Spirituality',
    'Meaning, faith, spiritual practice and existential reflection.',
  ),

  state(
    'anxiety',
    'Anxiety',
    'Worry, tension or apprehension about possible outcomes.',
  ),
  state('stress', 'Stress', 'Pressure or strain in response to demands.'),
  state(
    'overwhelm',
    'Overwhelm',
    'Feeling that current demands exceed available capacity.',
  ),
  state('fatigue', 'Fatigue', 'Reduced physical or mental energy.'),
  state(
    'exhaustion',
    'Exhaustion',
    'Severe depletion after sustained effort or stress.',
  ),
  state(
    'burnout',
    'Burnout',
    'Sustained work-related depletion and detachment, used only as a user-described state.',
  ),
  state('sadness', 'Sadness', 'Low mood or sorrow.'),
  state('grief', 'Grief', 'Emotional response to loss.'),
  state(
    'loneliness',
    'Loneliness',
    'Painful lack of desired social connection.',
  ),
  state('anger', 'Anger', 'Strong displeasure or anger.'),
  state('irritation', 'Irritation', 'Mild anger, annoyance or impatience.'),
  state(
    'frustration',
    'Frustration',
    'Distress caused by obstacles or blocked progress.',
  ),
  state(
    'guilt',
    'Guilt',
    "Concern about having acted against one's values or obligations.",
  ),
  state('shame', 'Shame', 'Painful negative evaluation of oneself.'),
  state('fear', 'Fear', 'Fear in response to a perceived threat.'),
  state(
    'uncertainty',
    'Uncertainty',
    'Lack of confidence about what will happen or what to choose.',
  ),
  state(
    'confusion',
    'Confusion',
    'Difficulty understanding a situation or deciding what it means.',
  ),
  state('calm', 'Calm', 'A settled and regulated emotional state.'),
  state(
    'relief',
    'Relief',
    'Reduced tension after a threat or burden has passed.',
  ),
  state('joy', 'Joy', 'Strong positive emotion, delight or happiness.'),
  state(
    'contentment',
    'Contentment',
    'Quiet satisfaction with the present situation or experience.',
  ),
  state(
    'gratitude',
    'Gratitude',
    'Appreciation for a person, experience or circumstance.',
  ),
  state(
    'affection',
    'Affection',
    'Warmth, tenderness or fondness toward another person or living being.',
  ),
  state(
    'pride',
    'Pride',
    'Positive regard for an achievement, effort or quality.',
  ),
  state(
    'embarrassment',
    'Embarrassment',
    'Social discomfort after feeling exposed, awkward or negatively noticed.',
  ),
  state(
    'envy',
    'Envy',
    'Painful comparison involving something another person has or experiences.',
  ),
  state(
    'nostalgia',
    'Nostalgia',
    'Emotionally warm or bittersweet longing connected to the past.',
  ),
  state(
    'disgust',
    'Disgust',
    'Strong aversion or revulsion toward an experience, object or behavior.',
  ),
  state(
    'excitement',
    'Excitement',
    'High positive activation and anticipation.',
  ),
  state('motivation', 'Motivation', 'Readiness and desire to act.'),
  state(
    'apathy',
    'Apathy',
    'Low interest, initiative or emotional engagement.',
  ),
  state('boredom', 'Boredom', 'Low stimulation and difficulty engaging.'),
  state('focus', 'Focus', 'Sustained attention on a chosen task.'),
  state(
    'distraction',
    'Distraction',
    'Attention repeatedly pulled away from the intended task.',
  ),
  state(
    'confidence',
    'Confidence',
    "Trust in one's ability to handle a task or situation.",
  ),
  state(
    'insecurity',
    'Insecurity',
    'Self-doubt or lack of felt safety in a situation.',
  ),
  state('hope', 'Hope', 'Positive expectation that improvement is possible.'),
  state(
    'disappointment',
    'Disappointment',
    'Sadness after expectations were not met.',
  ),
  state(
    'resentment',
    'Resentment',
    'Persistent anger related to perceived unfairness.',
  ),
  state('energized', 'Energized', 'High available physical or mental energy.'),

  mechanism(
    'avoidance',
    'Avoidance',
    'Moving away from a difficult task, feeling or situation.',
  ),
  mechanism(
    'procrastination',
    'Procrastination',
    'Delaying an intended action despite expected costs.',
  ),
  mechanism(
    'perfectionism',
    'Perfectionism',
    'Standards or error sensitivity that interfere with completion or wellbeing.',
  ),
  mechanism(
    'rumination',
    'Rumination',
    'Repetitive thinking that circles around distress without resolving it.',
  ),
  mechanism(
    'catastrophizing',
    'Catastrophizing',
    'Focusing on an extreme negative outcome as if it were likely.',
  ),
  mechanism(
    'all_or_nothing_thinking',
    'All-or-nothing thinking',
    'Evaluating outcomes in rigid success-or-failure categories.',
  ),
  mechanism(
    'self_criticism',
    'Self-criticism',
    "Harsh internal evaluation of one's actions or qualities.",
  ),
  mechanism(
    'people_pleasing',
    'People pleasing',
    "Prioritizing approval or others' comfort over one's own needs.",
  ),
  mechanism(
    'boundary_setting',
    'Boundary setting',
    'Clarifying and protecting personal limits.',
  ),
  mechanism(
    'emotional_regulation',
    'Emotional regulation',
    'Actions that influence emotional intensity or duration.',
  ),
  mechanism(
    'cognitive_reappraisal',
    'Cognitive reappraisal',
    'Changing an interpretation to change its emotional impact.',
  ),
  mechanism(
    'exposure',
    'Exposure',
    'Gradually approaching a feared or avoided situation.',
  ),
  mechanism(
    'habit_cue',
    'Habit cue',
    'A recurring cue that initiates a habitual action.',
  ),
  mechanism(
    'environment_design',
    'Environment design',
    'Changing surroundings to support desired behavior.',
  ),
  mechanism(
    'implementation_intention',
    'Implementation intention',
    'A concrete if-then plan linking a cue to an action.',
  ),
  mechanism(
    'gradual_progression',
    'Gradual progression',
    'Increasing difficulty or exposure in manageable steps.',
  ),
  mechanism(
    'progressive_overload',
    'Progressive overload',
    'Systematically increasing training demand to support adaptation.',
  ),
  mechanism(
    'load_management',
    'Load management',
    'Balancing demand, capacity and recovery over time.',
  ),
  mechanism(
    'recovery',
    'Recovery',
    'Restorative behavior after physical or mental effort.',
  ),
  mechanism(
    'sleep_consistency',
    'Sleep consistency',
    'Keeping sleep and wake timing stable.',
  ),
  mechanism(
    'active_recall',
    'Active recall',
    'Retrieving learned information from memory instead of rereading it.',
  ),
  mechanism(
    'spaced_repetition',
    'Spaced repetition',
    'Reviewing information at increasing intervals.',
  ),
  mechanism(
    'deliberate_practice',
    'Deliberate practice',
    'Focused practice with feedback on a specific skill.',
  ),
  mechanism(
    'planning',
    'Planning',
    'Defining intended actions, sequence or resources in advance.',
  ),
  mechanism(
    'prioritization',
    'Prioritization',
    'Choosing what deserves attention before other demands.',
  ),
  mechanism(
    'task_breakdown',
    'Task breakdown',
    'Dividing a large action into smaller executable steps.',
  ),
  mechanism(
    'time_blocking',
    'Time blocking',
    'Reserving defined periods for specific activities.',
  ),
  mechanism(
    'attention_switching',
    'Attention switching',
    'Moving attention between tasks intentionally or reactively.',
  ),
  mechanism(
    'decision_fatigue',
    'Decision fatigue',
    'Reduced decision quality or willingness after many decisions.',
  ),
  mechanism(
    'social_support',
    'Social support',
    'Using emotional, practical or informational support from other people.',
  ),
  mechanism(
    'conflict_avoidance',
    'Conflict avoidance',
    'Avoiding disagreement or difficult interpersonal conversations.',
  ),
  mechanism(
    'assertive_communication',
    'Assertive communication',
    'Expressing needs and limits clearly while respecting others.',
  ),
  mechanism(
    'reassurance_seeking',
    'Reassurance seeking',
    'Repeatedly seeking certainty or validation to reduce distress.',
  ),
  mechanism(
    'comparison',
    'Social comparison',
    'Evaluating oneself through comparison with other people.',
  ),
  mechanism(
    'overcommitment',
    'Overcommitment',
    'Accepting more obligations than available capacity supports.',
  ),
  mechanism(
    'under_recovery',
    'Insufficient recovery',
    'Recovery that is too limited for accumulated demand.',
  ),
  mechanism(
    'reward_loop',
    'Reward loop',
    'Behavior maintained by an immediate or anticipated reward.',
  ),
  mechanism(
    'trigger_response',
    'Trigger-response pattern',
    'A recurring cue followed by a predictable reaction.',
  ),
  mechanism(
    'journaling',
    'Journaling',
    'Using written reflection to observe or process experience.',
  ),
  mechanism(
    'breathing_regulation',
    'Breathing regulation',
    'Using breathing patterns to influence arousal.',
  ),
  mechanism(
    'acceptance',
    'Acceptance',
    'Allowing an internal experience without unnecessary struggle.',
  ),
  mechanism(
    'values_alignment',
    'Values alignment',
    'Choosing actions based on personally important values.',
  ),
  mechanism(
    'self_compassion',
    'Self-compassion',
    'Responding to difficulty with understanding instead of harsh judgment.',
  ),
  mechanism(
    'problem_solving',
    'Problem solving',
    'Defining a problem, generating options and testing a solution.',
  ),
  mechanism(
    'behavioral_activation',
    'Behavioral activation',
    'Using planned meaningful activity to counter withdrawal.',
  ),
  mechanism(
    'uncertainty_tolerance',
    'Uncertainty tolerance',
    'Remaining engaged without requiring complete certainty first.',
  ),
  mechanism(
    'impulse_control',
    'Impulse control',
    'Creating space between an urge and an action.',
  ),
  mechanism(
    'energy_management',
    'Energy management',
    'Matching tasks and recovery to available energy.',
  ),
  mechanism(
    'feedback_loop',
    'Feedback loop',
    'Using outcomes to adjust the next action.',
  ),
  mechanism(
    'measurement_based_adjustment',
    'Measurement-based adjustment',
    'Changing a plan using tracked observations or results.',
  ),
];
