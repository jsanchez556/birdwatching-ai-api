class ShortTermMemory {
  constructor({ conversationService } = {}) {
    this.conversationService = conversationService;
  }

  async retrieve({ conversationId, userId } = {}) {
    if (!conversationId || !this.conversationService?.getConversationMessages) {
      return [];
    }

    return this.conversationService.getConversationMessages(conversationId, { userId });
  }
}

export {
  ShortTermMemory,
};
