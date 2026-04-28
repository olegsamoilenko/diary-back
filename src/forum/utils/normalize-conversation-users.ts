export function normalizeConversationUsers(userA: number, userB: number) {
  return userA < userB
    ? { userOneId: userA, userTwoId: userB }
    : { userOneId: userB, userTwoId: userA };
}
