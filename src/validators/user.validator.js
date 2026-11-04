import { z } from 'zod';

const strictEmailSchema = z.string({ required_error: "Email address is required" })
    .trim()
    .min(1, "Email address is required")
    .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/i, "Email address must contain '@' and '.' (e.g. name@domain.com)");

const createUser = z.object({
    body: z.object({
        name: z.string().optional().or(z.literal('')),
        phonenumber: z.string().optional().or(z.literal('')),
        email: strictEmailSchema,
        password: z.string().optional().or(z.literal('')),
        role: z.enum(['Admin', 'User', 'Subuser', 'Vendor']).default('User'),
        status: z.enum(['Active', 'Inactive']).optional(),
        user_id: z.string().optional().or(z.literal('')),
        parentUser: z.string().optional().nullable(),
        canCreateUser: z.boolean().optional(),
        hasInspectionAccess: z.boolean().optional(),
        allowedPages: z.array(z.string()).optional(),
        projects: z.array(z.any()).optional(),
        stores: z.array(z.any()).optional()
    }).passthrough()
});

const updateUser = z.object({
    body: z.object({
        name: z.string().optional().or(z.literal('')),
        phonenumber: z.string().optional().or(z.literal('')),
        email: strictEmailSchema.optional(),
        password: z.string().optional().or(z.literal('')),
        role: z.enum(['Admin', 'User', 'Subuser', 'Vendor']).optional(),
        status: z.enum(['Active', 'Inactive']).optional(),
        user_id: z.string().optional().or(z.literal('')),
        parentUser: z.string().optional().nullable(),
        canCreateUser: z.boolean().optional(),
        hasInspectionAccess: z.boolean().optional(),
        allowedPages: z.array(z.string()).optional(),
        projects: z.array(z.any()).optional(),
        stores: z.array(z.any()).optional()
    }).passthrough()
});

const requestOtp = z.object({
    body: z.object({
        email: strictEmailSchema
    })
});

const verifyOtp = z.object({
    body: z.object({
        email: strictEmailSchema,
        otp: z.union([z.string(), z.number()])
            .transform(v => String(v).trim())
            .refine(v => v.length === 6, { message: "Verification code must be 6 digits" })
    })
});

const loginUser = z.object({
    body: z.object({
        email: strictEmailSchema,
        password: z.string().optional(),
        otp: z.string().optional()
    })
});

export const userValidator = {
    createUser,
    updateUser,
    loginUser,
    requestOtp,
    verifyOtp
};
