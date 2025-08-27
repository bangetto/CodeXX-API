import { Type, Static } from "@sinclair/typebox";

// Define the schemas for request validation
export const RunCodeBodySchema = Type.Object({
    code: Type.String({ minLength: 1 }),
    language: Type.String({ minLength: 1 }),
    input: Type.Optional(Type.String()),
    tests: Type.Optional(Type.Array(Type.Object({
        input: Type.String(),
        output: Type.Optional(Type.String())
    })))
});

const BaseResponseSchema = Type.Object({
    timeStamp: Type.Number(),
    status: Type.Number(),
});
const SuccessDataSchema = Type.Object({
    output: Type.Optional(Type.String()),
    testResults: Type.Optional(Type.Array(Type.Object({
        output: Type.String(),
        passed: Type.Boolean()
    }))),
    error: Type.Optional(Type.String()),
    language: Type.String(),
    info: Type.String(),
});
const ErrorDataSchema = Type.Object({
    error: Type.String(),
});
const listDataSchema = Type.Object({
    supportedLanguages: Type.Record(
        Type.String(), Type.Object({
            info: Type.String()
    })),
    version: Type.Number(),
});
const statusDataSchema = Type.Object({
    uptime: Type.Number(),
    version: Type.Number(),
});
export const SuccessResponseSchema = Type.Intersect([SuccessDataSchema,BaseResponseSchema]);
export const ErrorResponseSchema = Type.Intersect([ErrorDataSchema, BaseResponseSchema]); 
export const ListResponseSchema = Type.Intersect([listDataSchema, BaseResponseSchema]);
export const statusResponseSchema = Type.Intersect([statusDataSchema, BaseResponseSchema]);

export type RunCodeRequest = Static<typeof RunCodeBodySchema>;
export type SuccessResponse = Static<typeof SuccessResponseSchema>;
export type ErrorResponse = Static<typeof ErrorResponseSchema>;
export type ListResponse = Static<typeof ListResponseSchema>;
export type StatusResponse = Static<typeof statusResponseSchema>;