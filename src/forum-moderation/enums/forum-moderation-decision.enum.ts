export enum ForumModerationDecision {
  ALLOW = 'allow',
  NEEDS_LLM_REVIEW = 'needs_llm_review',
  BLOCK = 'block',
  ESCALATE_HUMAN = 'escalate_human',
}
