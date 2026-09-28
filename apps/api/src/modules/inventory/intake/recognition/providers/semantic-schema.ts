/** JSON Schema sent to providers. Runtime Zod validation remains authoritative. */
export const SEMANTIC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", minLength: 1, maxLength: 80 },
          photoIds: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { type: "string", format: "uuid" },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          fields: {
            type: "array",
            maxItems: 70,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: {
                  type: "string",
                  enum: [
                    "equipmentClass",
                    "manufacturer",
                    "model",
                    "serial",
                    "voltage",
                    "phase",
                    "fuel",
                    "capacityLb",
                  ],
                },
                value: { type: ["string", "null"], maxLength: 240 },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                photoId: { type: "string", format: "uuid" },
                box: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    x: { type: "number", minimum: 0, maximum: 1 },
                    y: { type: "number", minimum: 0, maximum: 1 },
                    width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
                    height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
                  },
                  required: ["x", "y", "width", "height"],
                },
                ocrLineIds: {
                  type: "array",
                  maxItems: 20,
                  items: { type: "string", minLength: 1, maxLength: 100 },
                },
              },
              required: [
                "field",
                "value",
                "confidence",
                "photoId",
                "box",
                "ocrLineIds",
              ],
            },
          },
          quality: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                photoId: { type: "string", format: "uuid" },
                reason: {
                  type: "string",
                  enum: ["blur", "glare", "cutoff", "small_text", "unreadable"],
                },
              },
              required: ["photoId", "reason"],
            },
          },
        },
        required: ["key", "photoIds", "confidence", "fields", "quality"],
      },
    },
    requestId: { type: ["string", "null"], maxLength: 200 },
  },
  required: ["groups", "requestId"],
} as const;

export const GEMINI_SEMANTIC_SCHEMA = {
  type: "OBJECT",
  properties: {
    groups: {
      type: "ARRAY",
      maxItems: 100,
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          photoIds: { type: "ARRAY", items: { type: "STRING" } },
          confidence: { type: "NUMBER" },
          fields: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                field: {
                  type: "STRING",
                  enum: [
                    "equipmentClass",
                    "manufacturer",
                    "model",
                    "serial",
                    "voltage",
                    "phase",
                    "fuel",
                    "capacityLb",
                  ],
                },
                value: { type: "STRING", nullable: true },
                confidence: { type: "NUMBER" },
                photoId: { type: "STRING" },
                box: {
                  type: "OBJECT",
                  properties: {
                    x: { type: "NUMBER" },
                    y: { type: "NUMBER" },
                    width: { type: "NUMBER" },
                    height: { type: "NUMBER" },
                  },
                  required: ["x", "y", "width", "height"],
                },
              },
              required: ["field", "value", "confidence", "photoId", "box"],
            },
          },
          quality: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                photoId: { type: "STRING" },
                reason: {
                  type: "STRING",
                  enum: ["blur", "glare", "cutoff", "small_text", "unreadable"],
                },
              },
              required: ["photoId", "reason"],
            },
          },
        },
        required: ["key", "photoIds", "confidence", "fields", "quality"],
      },
    },
    requestId: { type: "STRING", nullable: true },
  },
  required: ["groups", "requestId"],
} as const;
