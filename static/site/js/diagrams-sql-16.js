// diagrams-sql-16.js
// Схемы этапа 16: автоматизация.
//
// Оснастка общая (diagrams-sql-kit.js), правила те же: самодостаточный модуль,
// цвета только через CSS-переменные страницы, никакого JS внутри SVG.
// Образец стиля — diagrams-sql-02.js.

// eslint-disable-next-line no-unused-vars
import { arrowDefs, checkIcon, crossIcon, svgWrap } from "./diagrams-sql-kit.js";

export const REGISTRY = {};

// Привязка схем к нодам: код ноды -> список id.
export const INDEX = {};
