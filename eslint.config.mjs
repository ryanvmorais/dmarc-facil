/**
 * @file Configuração flat do ESLint.
 *
 * O código do navegador (`public/`) e o dos testes e configs (Node) rodam em ambientes
 * diferentes, então cada um recebe os seus globais: sem isso o `no-undef` acusaria `document`
 * no Node e `process` no navegador. O Prettier cuida do estilo; o ESLint 10 não traz regra
 * de formatação no preset recomendado, então não há o que desligar. Os `ignores` seguem o
 * `.prettierignore`.
 */

import js from "@eslint/js";
import globals from "globals";

const configuracao = [
  { ignores: ["node_modules/**", "coverage/**"] },
  js.configs.recommended,
  {
    // Regras além do recomendado: igualdade estrita e nada de `var`, porque o código roda
    // direto no navegador, sem transpilador que corrija descuido.
    rules: {
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["test/**/*.js", "*.mjs"],
    languageOptions: { globals: globals.node },
  },
];

export default configuracao;
