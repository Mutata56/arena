// diagrams-sql.js
// Сборщик схем раздела DBA.
//
// Сами схемы лежат по файлам этапов (diagrams-sql-NN.js), а здесь только
// склейка их реестров в один. Так файл со схемами одного этапа остаётся
// обозримым, и над разными этапами можно работать, не сталкиваясь в одном файле.
//
// Добавляя этап: заведи diagrams-sql-NN.js по образцу соседнего, экспортируй
// из него REGISTRY и INDEX и допиши сюда одну строку импорта и одну в PARTS.

import * as s02 from "./diagrams-sql-02.js";
import * as s03 from "./diagrams-sql-03.js";
import * as s04 from "./diagrams-sql-04.js";
import * as s05 from "./diagrams-sql-05.js";
import * as s06 from "./diagrams-sql-06.js";
import * as s07 from "./diagrams-sql-07.js";
import * as s08 from "./diagrams-sql-08.js";
import * as s09 from "./diagrams-sql-09.js";
import * as s10 from "./diagrams-sql-10.js";
import * as s11 from "./diagrams-sql-11.js";
import * as s12 from "./diagrams-sql-12.js";
import * as s13 from "./diagrams-sql-13.js";
import * as s14 from "./diagrams-sql-14.js";
import * as s15 from "./diagrams-sql-15.js";
import * as s16 from "./diagrams-sql-16.js";
import * as s17 from "./diagrams-sql-17.js";
import * as s18 from "./diagrams-sql-18.js";

const PARTS = [s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18];

export const SQL_REGISTRY = Object.assign({}, ...PARTS.map((p) => p.REGISTRY));
export const SQL_INDEX = Object.assign({}, ...PARTS.map((p) => p.INDEX));
