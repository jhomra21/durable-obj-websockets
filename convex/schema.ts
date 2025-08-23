import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  images: defineTable({
    imageUrl: v.string(),
    model: v.optional(v.string()),
    prompt: v.string(),
    seed: v.optional(v.number()),
    steps: v.optional(v.number()),
    userId: v.string(),
  }).index("by_userId", ["userId"]),

  agents: defineTable({
    userId: v.string(),
    userName: v.optional(v.string()),
    prompt: v.string(),
    imageUrl: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    voice: v.optional(v.union(
      v.literal("Aurora"), v.literal("Blade"), v.literal("Britney"),
      v.literal("Carl"), v.literal("Cliff"), v.literal("Richard"),
      v.literal("Rico"), v.literal("Siobhan"), v.literal("Vicky")
    )),
    audioSampleUrl: v.optional(v.string()),
    requestId: v.optional(v.string()),
    model: v.union(v.literal("normal"), v.literal("pro")),
    status: v.union(v.literal("idle"), v.literal("processing"), v.literal("success"), v.literal("failed"), v.literal("deleting")),
    type: v.union(v.literal("image-generate"), v.literal("image-edit"), v.literal("voice-generate"), v.literal("video-generate"), v.literal("video-image-to-video"), v.literal("ai-chat")),
    connectedAgentId: v.optional(v.id("agents")),
    uploadedImageUrl: v.optional(v.string()),
    activeImageUrl: v.optional(v.string()), // For edit agents: which image to use as input (original or generated)
    // AI Chat Agent specific fields
    chatHistory: v.optional(v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      timestamp: v.number(),
      metadata: v.optional(v.object({
        referencedAgents: v.optional(v.array(v.id("agents"))),
        uploadedFiles: v.optional(v.array(v.string())),
        createdAgents: v.optional(v.array(v.id("agents")))
      }))
    }))),
    activeOperations: v.optional(v.array(v.object({
      id: v.string(),
      type: v.string(), // "create_agents", "modify_agents"
      status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
      createdAgents: v.optional(v.array(v.id("agents"))),
      error: v.optional(v.string())
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_connected_agent", ["connectedAgentId"])
    .index("by_request_id", ["requestId"]),
}); 