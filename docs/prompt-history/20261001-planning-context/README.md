# Planning data placement correction — 1 October 2026

User clarified that concrete goals/progress are context, not common system-service data. Removed goalsPrompt rendering from buildResponseServiceBlock. AiService.generateComment sends the supplied value once as a labelled user planning_context message before source metrics and the existing context cache boundary; empty input is omitted. Public adapter argument remains compatible. Period planners already live in snapshot context; conversation has no journal planner context. Shared instructions about interpreting plans and all mode tasks/output limits are unchanged.

The earlier common-2500-o200k/common.uk.txt is a historical review translation; its goals/progress placeholder is superseded by this correction. Its empty-goals fixture count2356 is unchanged. Arbitrary aboutMe still affects shared size; goals now affect context only.

Snapshots and changes.patch preserve this narrow follow-up separately. To roll back only this correction, first run git apply --reverse --check on this changes.patch; apply --reverse only on user request after a successful check. Update the product/pipeline note if rolled back. To undo the preceding larger unification, first reverse this newer correction.
