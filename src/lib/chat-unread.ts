export type ChatUnreadConversationUpdate = {
  id: string;
  unread_count: number;
};

export function updateUnreadConversationIds(
  currentIds: string[],
  update: ChatUnreadConversationUpdate
) {
  const ids = new Set(currentIds);

  if (update.unread_count > 0) {
    ids.add(update.id);
  } else {
    ids.delete(update.id);
  }

  return [...ids];
}
