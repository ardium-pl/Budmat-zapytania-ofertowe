const z = require('zod');

const AttachmentSchema = z.object({
    filename: z.string(),
    processed: z.boolean()
});

const EmailDataSchema = z.object({
    subject: z.string(),
    body: z.string(),
    metadata: z.object({
        emailId: z.string(),
        content: z.object({
            subject: z.string(),
            body: z.string()
        }),
        attachments: z.array(AttachmentSchema)
    }),
    attachments: z.array(z.any()).optional()
});

const ProductSchema = z.object({
    itemNumber: z.string().optional(),
    grade: z.string().optional(),
    surface: z.string().optional(),
    thickness: z.number().optional(),
    width: z.number().optional(),
    length: z.number().optional(),
    quantity: z.number().optional(),
    price: z.number().optional()
});

const OutputSchema = z.object({
    offerNumber: z.string().optional(),
    offerDate: z.string().optional(),
    customer: z.object({
        name: z.string().optional(),
        location: z.string().optional()
    }).optional(),
    supplier: z.object({
        name: z.string().optional(),
        contact: z.object({
            name: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional()
        }).optional()
    }).optional(),
    offerDetails: z.object({
        paymentTerms: z.string().optional(),
        deliveryTerms: z.string().optional(),
        currency: z.string().optional(),
        totalQuantity: z.number().optional(),
        periodOffered: z.string().optional()
    }).optional(),
    products: z.array(ProductSchema).optional()
});

module.exports = {
    EmailDataSchema,
    OutputSchema
};