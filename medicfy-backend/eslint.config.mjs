import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
  },
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      // NestJS modules are idiomatically empty classes carrying only
      // the @Module decorator.
      "@typescript-eslint/no-extraneous-class": "off",
      // @UsePipes at the method level validates every handler
      // parameter — including @Param()/@Query() — not just @Body().
      // This has caused real bugs twice (POST /admin/doctors/:id/reject
      // in M2, then complete/cancel/reschedule in M5a's
      // appointments.controller.ts). A comment reminding people isn't
      // enough — a third occurrence, in a prescriptions controller,
      // would cost far more than red tests. Bind the pipe to the
      // specific parameter instead: @Body(new ZodValidationPipe(schema)).
      "no-restricted-syntax": [
        "error",
        {
          selector: "MethodDefinition > Decorator[expression.callee.name='UsePipes']",
          message:
            "Don't use @UsePipes at the method level — it validates every parameter, not just @Body(). Bind the pipe to the parameter instead: @Body(new ZodValidationPipe(schema)).",
        },
      ],
    },
  }
);
