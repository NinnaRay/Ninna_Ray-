import { users, conversations, messages, contentItems, managerActions, managerLog, payments, avatarElements, avatarInstances, type User, type InsertUser, type Conversation, type InsertConversation, type Message, type InsertMessage, type ContentItem, type InsertContentItem, type ManagerAction, type ManagerLog, type Payment, type InsertPayment, type AvatarElement, type InsertAvatarElement, type AvatarInstance, type InsertAvatarInstance } from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByChatCode(chatCode: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  incrementMessageCount(userId: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationsByUser(userId: number): Promise<Conversation[]>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(userId: number, title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  setManualMode(conversationId: number, manual: boolean, agentName?: string): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  getAllMessages(): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
  updateAiProfile(userId: number, profile: Record<string, any>): Promise<void>;
  createContentItem(item: InsertContentItem): Promise<ContentItem>;
  getAllContentItems(): Promise<ContentItem[]>;
  getContentItem(id: number): Promise<ContentItem | undefined>;
  deleteContentItem(id: number): Promise<void>;
  incrementContentUsage(id: number): Promise<void>;
  createManagerAction(data: { userId: number | null; type: string; message?: string; photoId?: number; price?: number; purpose?: string; timing?: string }): Promise<ManagerAction>;
  getManagerActions(since?: Date): Promise<ManagerAction[]>;
  updateManagerAction(id: number, updates: Partial<{ status: string; result: string; executedAt: Date }>): Promise<void>;
  addManagerLog(event: string, detail?: string): Promise<void>;
  getManagerLogs(limit?: number): Promise<ManagerLog[]>;
  updateUser(id: number, updates: Partial<{ platform: string }>): Promise<void>;
  updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<void>;
  deleteUser(userId: number): Promise<void>;
  createPayment(data: InsertPayment): Promise<Payment>;
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  getAllPayments(): Promise<Payment[]>;
  updatePaymentStatus(id: number, status: string, stripePaymentIntentId?: string): Promise<void>;
  getPaymentByStripeSession(sessionId: string): Promise<Payment | undefined>;
  getPaymentStats(): Promise<{ totalRevenue: number; totalPayments: number; successfulPayments: number }>;

  // ─── Virtual Twin: Avatar ──────────────────────────────────────────────────
  getAvatarInstance(userId: number): Promise<AvatarInstance | undefined>;
  createAvatarInstance(userId: number): Promise<AvatarInstance>;
  updateAvatarConfig(userId: number, visualConfig: Record<string, any>): Promise<AvatarInstance>;
  resetAvatarConfig(userId: number): Promise<AvatarInstance>;
  getAvatarElementsByContentItem(contentItemId: number): Promise<AvatarElement[]>;
  getAvatarElementsForUser(userId: number): Promise<AvatarElement[]>;
  createAvatarElement(data: InsertAvatarElement): Promise<AvatarElement>;
  deleteAvatarElement(id: number): Promise<void>;
  getAllAvatarElements(): Promise<AvatarElement[]>;
  updateAvatarLastInteraction(userId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByChatCode(chatCode: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.chatCode, chatCode.toUpperCase()));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const chatCode = `NINNA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [user] = await db.insert(users).values({ ...insertUser, chatCode }).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async incrementMessageCount(userId: number): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user) {
      await db.update(users)
        .set({ messageCount: user.messageCount + 1 })
        .where(eq(users.id, userId));
    }
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationsByUser(userId: number): Promise<Conversation[]> {
    return db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt));
  }

  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async createConversation(userId: number, title: string): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values({ userId, title }).returning();
    return conversation;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async setManualMode(conversationId: number, manual: boolean, agentName?: string): Promise<void> {
    await db.update(conversations)
      .set({ manualMode: manual, assignedAgent: agentName ?? null })
      .where(eq(conversations.id, conversationId));
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async getAllMessages(): Promise<Message[]> {
    return db.select().from(messages).orderBy(desc(messages.createdAt));
  }

  async updateAiProfile(userId: number, profile: Record<string, any>): Promise<void> {
    await db.update(users)
      .set({ aiProfile: profile, aiProfileUpdatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  }

  async createContentItem(item: InsertContentItem): Promise<ContentItem> {
    const [ci] = await db.insert(contentItems).values(item).returning();
    return ci;
  }

  async getAllContentItems(): Promise<ContentItem[]> {
    return db.select().from(contentItems).orderBy(desc(contentItems.createdAt));
  }

  async getContentItem(id: number): Promise<ContentItem | undefined> {
    const [ci] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    return ci;
  }

  async deleteContentItem(id: number): Promise<void> {
    await db.delete(contentItems).where(eq(contentItems.id, id));
  }

  async incrementContentUsage(id: number): Promise<void> {
    const ci = await this.getContentItem(id);
    if (ci) {
      await db.update(contentItems).set({ timesUsed: ci.timesUsed + 1 }).where(eq(contentItems.id, id));
    }
  }

  async createManagerAction(data: { userId: number | null; type: string; message?: string; photoId?: number; price?: number; purpose?: string; timing?: string }): Promise<ManagerAction> {
    const [action] = await db.insert(managerActions).values({
      userId: data.userId,
      type: data.type,
      message: data.message || null,
      photoId: data.photoId || null,
      price: data.price || null,
      purpose: data.purpose || null,
      timing: data.timing || null,
    }).returning();
    return action;
  }

  async getManagerActions(since?: Date): Promise<ManagerAction[]> {
    if (since) {
      return db.select().from(managerActions).where(gte(managerActions.createdAt, since)).orderBy(desc(managerActions.createdAt));
    }
    return db.select().from(managerActions).orderBy(desc(managerActions.createdAt)).limit(200);
  }

  async updateManagerAction(id: number, updates: Partial<{ status: string; result: string; executedAt: Date }>): Promise<void> {
    await db.update(managerActions).set(updates).where(eq(managerActions.id, id));
  }

  async addManagerLog(event: string, detail?: string): Promise<void> {
    await db.insert(managerLog).values({ event, detail: detail || null });
  }

  async getManagerLogs(limit = 50): Promise<ManagerLog[]> {
    return db.select().from(managerLog).orderBy(desc(managerLog.createdAt)).limit(limit);
  }

  async updateUser(id: number, updates: Partial<{ platform: string }>): Promise<void> {
    await db.update(users).set(updates).where(eq(users.id, id));
  }

  async updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<void> {
    await db.update(users)
      .set({ stripeCustomerId })
      .where(eq(users.id, userId));
  }

  async deleteUser(userId: number): Promise<void> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    for (const conv of userConvs) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    await db.delete(conversations).where(eq(conversations.userId, userId));
    await db.delete(managerActions).where(eq(managerActions.userId, userId));
    await db.delete(payments).where(eq(payments.userId, userId));
    await db.delete(avatarInstances).where(eq(avatarInstances.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  async createPayment(data: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt));
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async updatePaymentStatus(id: number, status: string, stripePaymentIntentId?: string): Promise<void> {
    const updates: Record<string, any> = { status };
    if (stripePaymentIntentId) updates.stripePaymentIntentId = stripePaymentIntentId;
    await db.update(payments).set(updates).where(eq(payments.id, id));
  }

  async getPaymentByStripeSession(sessionId: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.stripeSessionId, sessionId));
    return payment;
  }

  async getPaymentStats(): Promise<{ totalRevenue: number; totalPayments: number; successfulPayments: number }> {
    const allPays = await db.select().from(payments);
    const successful = allPays.filter(p => p.status === "completed");
    return {
      totalRevenue: successful.reduce((sum, p) => sum + p.amount, 0),
      totalPayments: allPays.length,
      successfulPayments: successful.length,
    };
  }

  // ─── Virtual Twin: Avatar ──────────────────────────────────────────────────

  async getAvatarInstance(userId: number): Promise<AvatarInstance | undefined> {
    const [instance] = await db.select().from(avatarInstances).where(eq(avatarInstances.userId, userId));
    return instance;
  }

  async createAvatarInstance(userId: number): Promise<AvatarInstance> {
    const [instance] = await db.insert(avatarInstances).values({
      userId,
      visualConfig: {},
      personaName: "Ninna",
      capabilityLevel: 1,
    }).returning();
    return instance;
  }

  async updateAvatarConfig(userId: number, visualConfig: Record<string, any>): Promise<AvatarInstance> {
    const existing = await this.getAvatarInstance(userId);
    if (!existing) {
      const created = await this.createAvatarInstance(userId);
      const [updated] = await db.update(avatarInstances)
        .set({ visualConfig, updatedAt: new Date() })
        .where(eq(avatarInstances.id, created.id))
        .returning();
      return updated;
    }
    const [updated] = await db.update(avatarInstances)
      .set({ visualConfig, updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId))
      .returning();
    return updated;
  }

  async resetAvatarConfig(userId: number): Promise<AvatarInstance> {
    const existing = await this.getAvatarInstance(userId);
    if (!existing) {
      return this.createAvatarInstance(userId);
    }
    const [updated] = await db.update(avatarInstances)
      .set({ visualConfig: {}, updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId))
      .returning();
    return updated;
  }

  async getAvatarElementsByContentItem(contentItemId: number): Promise<AvatarElement[]> {
    return db.select().from(avatarElements)
      .where(eq(avatarElements.contentItemId, contentItemId));
  }

  async getAvatarElementsForUser(userId: number): Promise<AvatarElement[]> {
    // Vrátit elementy z fotek, které zákazník zakoupil (payments completed)
    const userPayments = await db.select().from(payments)
      .where(eq(payments.userId, userId));
    const paidContentIds = userPayments
      .filter(p => p.status === "completed" && p.contentItemId)
      .map(p => p.contentItemId as number);

    if (paidContentIds.length === 0) return [];

    const elements = await db.select().from(avatarElements);
    return elements.filter(e => e.contentItemId && paidContentIds.includes(e.contentItemId));
  }

  async createAvatarElement(data: InsertAvatarElement): Promise<AvatarElement> {
    const [element] = await db.insert(avatarElements).values(data).returning();
    return element;
  }

  async deleteAvatarElement(id: number): Promise<void> {
    await db.delete(avatarElements).where(eq(avatarElements.id, id));
  }

  async getAllAvatarElements(): Promise<AvatarElement[]> {
    return db.select().from(avatarElements).orderBy(desc(avatarElements.createdAt));
  }

  async updateAvatarLastInteraction(userId: number): Promise<void> {
    await db.update(avatarInstances)
      .set({ lastInteraction: new Date(), updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId));
  }
}

export const storage = new DatabaseStorage();
