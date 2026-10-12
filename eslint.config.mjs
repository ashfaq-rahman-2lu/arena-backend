import { basename } from "node:path";
import tseslint from "typescript-eslint";
const arena = {
  rules: {
    "no-double-cast": {
      meta: {
        schema: [],
        messages: {
          invalid: "Validate unknown values instead of double casting.",
        },
      },
      create(context) {
        return {
          TSAsExpression(node) {
            if (node.expression.type === "TSAsExpression")
              context.report({ node, messageId: "invalid" });
          },
        };
      },
    },
    "explicit-parameters": {
      meta: {
        schema: [],
        messages: {
          invalid:
            "Every parameter, including callbacks, needs an explicit type.",
        },
      },
      create(context) {
        function check(node) {
          for (const parameter of node.params) {
            const target =
              parameter.type === "AssignmentPattern"
                ? parameter.left
                : parameter.type === "TSParameterProperty"
                  ? parameter.parameter
                  : parameter;
            if (!target.typeAnnotation)
              context.report({ node: target, messageId: "invalid" });
          }
        }
        return {
          FunctionDeclaration: check,
          FunctionExpression: check,
          ArrowFunctionExpression: check,
        };
      },
    },
    "artifact-name": {
      meta: {
        schema: [],
        messages: {
          invalid:
            "Nest artifacts require a descriptive artifact suffix and matching kebab-case filename.",
        },
      },
      create(context) {
        return {
          ClassDeclaration(node) {
            const decorators = node.decorators ?? [];
            const names = decorators.map((d) =>
              d.expression.type === "CallExpression"
                ? d.expression.callee.name
                : undefined,
            );
            if (
              !names.some((n) =>
                ["Injectable", "Controller", "Module", "Catch"].includes(n),
              )
            )
              return;
            const name = node.id.name;
            const normalized = name
              .replaceAll("OAuth", "Oauth")
              .replaceAll("OpenAI", "OpenAi");
            const stem = normalized
              .replace(
                /(Service|Repository|Adapter|Guard|Controller|Module|Filter|Pipe)$/,
                (suffix) => "." + suffix.toLowerCase(),
              )
              .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
              .toLowerCase();
            if (
              !/(Service|Repository|Adapter|Guard|Controller|Module|Filter|Pipe)$/.test(
                name,
              ) ||
              basename(context.filename) !== stem + ".ts"
            )
              context.report({ node: node.id, messageId: "invalid" });
          },
        };
      },
    },
  },
};
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "src/generated/**",
      "**/.agents/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ["src/lint-fixture.ts"],
          defaultProject: "tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin, arena },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: false,
          allowTypedFunctionExpressions: false,
          allowHigherOrderFunctions: false,
        },
      ],
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "arena/no-double-cast": "error",
      "arena/explicit-parameters": "error",
      "arena/artifact-name": "error",
    },
  },
);
