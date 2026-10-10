/* Глоссарий: термины в тексте статьи подчёркиваются пунктиром, по наведению
   всплывает короткое определение, по кнопке в шапке открывается весь словарь.

   Правило одно: подчёркиваем только ПЕРВОЕ вхождение термина на странице и
   никогда не лезем внутрь кода. Подсвеченный термин в каждом абзаце — это рябь,
   а не помощь. Выключается в настройках чтения.

   Определения писались по одному принципу: сказать то, на чём новичок
   спотыкается, а не пересказать документацию. */

const STYLE_ID = "arena-glossary-style";

export const TERMS = [
  // ------------------------------------------------------------ платформа
  { id: "jvm", term: "JVM", node: "1.03",
    forms: ["JVM", "виртуальная машина Java", "виртуальной машины Java"],
    short: "Виртуальная машина: программа, которая исполняет байткод.",
    full: "Исполняет .class-файлы, управляет памятью и сборкой мусора. Сама ничего не компилирует и стандартных классов не содержит — только движок исполнения.",
    see: ["jre", "jdk", "bytecode"] },
  { id: "jre", term: "JRE", node: "1.03",
    forms: ["JRE", "среда выполнения", "среды выполнения"],
    short: "JVM плюс стандартная библиотека классов: хватает, чтобы запустить.",
    full: "JRE = JVM + библиотека классов (`System.out`, `String`, коллекции). Готовую программу запустит, свою собрать не даст — компилятора в ней нет.",
    see: ["jvm", "jdk"] },
  { id: "jdk", term: "JDK", node: "1.03",
    forms: ["JDK", "комплект разработчика"],
    short: "JRE плюс инструменты разработчика, главный из них — javac.",
    full: "JDK = JRE + `javac`, `jshell`, `javap`, `jar`, отладчик. Разработчику нужен именно он: внутри уже есть всё для запуска. Есть работающий `javac` — перед тобой JDK.",
    see: ["jre", "jvm", "javac"] },
  { id: "bytecode", term: "байткод", node: "1.04",
    forms: ["байткод", "байткода", "байткоду", "байткодом", "байт-код"],
    short: "Промежуточный код в .class, который исполняет JVM.",
    full: "Не машинный код процессора и не исходник. Один и тот же .class крутится на любой ОС, где есть JVM — отсюда и «написано один раз, работает везде».",
    see: ["jvm", "javac", "class-file"] },
  { id: "javac", term: "javac", node: "1.04",
    forms: ["javac"],
    short: "Компилятор: превращает .java в .class.",
    full: "Проверяет синтаксис и типы и порождает байткод. Ошибки, которые ловит `javac`, называются ошибками компиляции: программа даже не запустится.",
    see: ["bytecode", "compile-error", "jdk"] },
  { id: "java-cmd", term: "java", node: "1.04",
    forms: ["лаунчер java", "команда java"],
    short: "Лаунчер: поднимает JVM и запускает класс с main.",
    full: "`java Hello` находит `Hello.class`, поднимает JVM, загружает класс и вызывает `main`. Всё, что падает на этом этапе, — ошибки выполнения.",
    see: ["jvm", "main", "runtime-error"] },
  { id: "class-file", term: ".class", node: "1.04",
    forms: [".class", "class-файл", "class-файла"],
    short: "Файл с байткодом, результат работы javac.",
    full: "Один файл на каждый класс, включая вложенные. Имя файла совпадает с именем класса — иначе JVM его не найдёт.",
    see: ["bytecode", "javac"] },
  { id: "jshell", term: "jshell",
    forms: ["jshell"],
    short: "Интерактивная песочница Java: пишешь строку, сразу видишь результат.",
    full: "Удобно проверить выражение, не заводя класс и `main`. Учебный инструмент, в проде не используется.",
    see: ["jdk"] },
  { id: "ide", term: "IDE",
    forms: ["IDE", "IDEA", "IntelliJ IDEA"],
    short: "Среда разработки: редактор, компилятор и запуск в одном окне.",
    full: "Делает за тебя то, что руками делается `javac` и `java`. Полезна, но на старте вредна: пока не собрал программу из терминала, непонятно, что происходит.",
    see: ["javac"] },
  { id: "jit", term: "JIT",
    forms: ["JIT", "JIT-компилятор"],
    short: "Компилятор внутри JVM: горячий байткод переводит в машинный код.",
    full: "Сначала JVM интерпретирует байткод, а часто исполняемые куски компилирует в машинный код прямо во время работы. Поэтому программа на Java разгоняется по ходу.",
    see: ["jvm", "bytecode"] },
  { id: "gc", term: "сборщик мусора",
    forms: ["сборщик мусора", "сборка мусора", "сборкой мусора", "garbage collector"],
    short: "Механизм JVM, который освобождает память под объектами без ссылок.",
    full: "Как только на объект не осталось ни одной ссылки, он становится мусором и рано или поздно будет убран. Освобождать память руками в Java нельзя и не нужно.",
    see: ["jvm", "heap", "reference"] },

  // ------------------------------------------------------------ строение программы
  { id: "class", term: "класс", node: "1.07",
    forms: ["класс", "класса", "классе", "классом", "классы"],
    short: "Описание: какие у объекта поля и что он умеет.",
    full: "Класс — чертёж, объект — изделие по этому чертежу. Из одного класса делают сколько угодно объектов, и у каждого свои значения полей.",
    see: ["object", "field", "method"] },
  { id: "object", term: "объект", node: "3.02",
    forms: ["объект", "объекта", "объекте", "объектом", "объекты"],
    short: "Экземпляр класса: живёт в куче, доступен по ссылке.",
    full: "Создаётся через `new`. Переменная хранит не сам объект, а ссылку на него: присвоил переменную другой — оба имени смотрят в одну коробку.",
    see: ["class", "reference", "heap"] },
  { id: "field", term: "поле", node: "3.12",
    forms: ["поле", "поля", "полем", "полей"],
    short: "Переменная, принадлежащая объекту или классу.",
    full: "У каждого объекта свой набор значений полей. Поле со `static` одно на весь класс и общее для всех объектов.",
    see: ["class", "static", "getter"] },
  { id: "method", term: "метод", node: "1.07",
    forms: ["метод", "метода", "методе", "методом", "методы"],
    short: "Именованный кусок кода, который можно вызвать.",
    full: "Принимает параметры, что-то делает и, если тип возврата не `void`, возвращает значение.",
    see: ["signature", "parameter", "return"] },
  { id: "main", term: "main", node: "1.07",
    forms: ["main"],
    short: "Точка входа: с неё JVM начинает выполнение.",
    full: "`public static void main(String[] args)`. `static` — потому что вызывается без объекта, `String[] args` — аргументы командной строки. Ошибёшься в сигнатуре — JVM метод не найдёт.",
    see: ["method", "signature", "java-cmd"] },
  { id: "signature", term: "сигнатура",
    forms: ["сигнатура", "сигнатуре", "сигнатуру", "сигнатурой"],
    short: "Имя метода плюс типы его параметров.",
    full: "Тип возвращаемого значения в сигнатуру не входит — поэтому два метода, отличающиеся только им, не скомпилируются.",
    see: ["overload", "method"] },
  { id: "parameter", term: "параметр",
    forms: ["параметр", "параметра", "параметры", "параметров"],
    short: "Переменная в объявлении метода. Аргумент — то, что подставили при вызове.",
    full: "`void say(String who)` — `who` это параметр. `say(\"demo_user\")` — здесь `\"demo_user\"` аргумент. Разница чисто в том, где стоишь: в объявлении или в вызове.",
    see: ["method"] },
  { id: "return", term: "возвращаемое значение",
    forms: ["возвращаемое значение", "возвращает значение", "return"],
    short: "То, что метод отдаёт наружу через return.",
    full: "Если тип возврата не `void`, `return` обязателен на каждом пути выполнения. `return` ещё и немедленно выходит из метода.",
    see: ["method"] },
  { id: "constructor", term: "конструктор",
    forms: ["конструктор", "конструктора", "конструкторе", "конструкторы"],
    short: "Метод без типа возврата, который готовит новый объект.",
    full: "Имя совпадает с именем класса. Если не написать ни одного, компилятор добавит пустой; если написать хоть один — не добавит.",
    see: ["object", "this"] },
  { id: "this", term: "this",
    forms: ["this"],
    short: "Ссылка на текущий объект.",
    full: "Нужен, когда параметр закрыл собой поле: `this.name = name`. Ещё через `this(...)` конструктор зовёт соседний конструктор того же класса.",
    see: ["constructor", "field"] },
  { id: "super", term: "super",
    forms: ["super"],
    short: "Обращение к родительской части объекта.",
    full: "`super(...)` вызывает конструктор родителя (первой строкой), `super.метод()` — родительскую версию переопределённого метода.",
    see: ["inheritance", "override"] },
  { id: "package", term: "пакет",
    forms: ["пакет", "пакета", "пакете", "пакетом"],
    short: "Папка для классов и заодно граница видимости.",
    full: "Классы одного пакета видят package-private члены друг друга. Пакет обязан совпадать с путём к файлу.",
    see: ["access-modifier", "package-private"] },

  // ------------------------------------------------------------ типы и значения
  { id: "primitive", term: "примитивный тип", node: "2.02",
    forms: ["примитивный тип", "примитивные типы", "примитив", "примитива", "примитивов"],
    short: "Восемь встроенных типов: значение лежит прямо в переменной.",
    full: "`byte`, `short`, `int`, `long`, `float`, `double`, `char`, `boolean`. У них нет методов и не бывает `null`.",
    see: ["reference-type", "int", "wrapper"] },
  { id: "reference-type", term: "ссылочный тип", node: "3.02",
    forms: ["ссылочный тип", "ссылочные типы", "ссылочного типа"],
    short: "Всё, что не примитив: переменная хранит ссылку, объект — в куче.",
    full: "Классы, массивы, интерфейсы, строки. Может быть `null`, и тогда обращение к члену даёт NPE.",
    see: ["reference", "null", "object"] },
  { id: "reference", term: "ссылка", node: "3.02",
    forms: ["ссылка", "ссылки", "ссылке", "ссылкой", "ссылок"],
    short: "Адрес объекта в куче, лежащий в переменной.",
    full: "Две ссылки могут смотреть в один объект — тогда изменение через одну видно через другую. `==` сравнивает именно ссылки, а не содержимое.",
    see: ["object", "equals", "null"] },
  { id: "null", term: "null", node: "3.02",
    forms: ["null"],
    short: "Ссылка, которая никуда не показывает.",
    full: "Это не объект и не «ноль». Любое обращение к полю или методу через `null` даёт NullPointerException.",
    see: ["npe", "reference"] },
  { id: "npe", term: "NullPointerException", node: "1.19",
    forms: ["NullPointerException", "NPE"],
    short: "Обращение к члену по ссылке, равной null.",
    full: "Ошибка времени выполнения, компилятор её не ловит. Начиная с Java 14 сообщение прямо называет, какая именно ссылка оказалась пустой.",
    see: ["null", "runtime-error"] },
  { id: "int", term: "int", node: "2.02",
    forms: ["int"],
    short: "Целое 32 бита, тип по умолчанию для целых чисел.",
    full: "От −2 147 483 648 до 2 147 483 647. Целочисленный литерал без суффикса — это `int`, поэтому 10 миллиардов без `L` не скомпилируются.",
    see: ["long", "overflow", "literal"] },
  { id: "long", term: "long", node: "2.02",
    forms: ["long"],
    short: "Целое 64 бита. Литерал требует суффикса L.",
    full: "`long ms = 10_000_000_000L`. Без `L` литерал сначала пробуют уложить в `int` — и не могут.",
    see: ["int", "literal"] },
  { id: "double", term: "double", node: "2.03",
    forms: ["double"],
    short: "Дробное 64 бита, тип по умолчанию для дробей.",
    full: "Хранит двоичную дробь, поэтому `0.1 + 0.2` даёт `0.30000000000000004`. Для денег берут `BigDecimal`, а не `double`.",
    see: ["float", "precision"] },
  { id: "float", term: "float", node: "2.03",
    forms: ["float"],
    short: "Дробное 32 бита, литерал требует суффикса f.",
    full: "`float f = 2.5f`. Без `f` литерал — это `double`, и в `float` он сам не сузится.",
    see: ["double", "literal"] },
  { id: "char", term: "char",
    forms: ["char"],
    short: "Один символ, он же беззнаковое целое 16 бит.",
    full: "`'A'` в одинарных кавычках. В арифметике ведёт себя как число: `'A' + 1` даёт `66`.",
    see: ["primitive", "widening"] },
  { id: "boolean", term: "boolean",
    forms: ["boolean"],
    short: "true или false, и ничего больше.",
    full: "В отличие от C, число в условие подставить нельзя: `if (1)` не скомпилируется.",
    see: ["primitive", "condition"] },
  { id: "literal", term: "литерал", node: "2.05",
    forms: ["литерал", "литерала", "литералы", "литералов"],
    short: "Значение, записанное в коде прямо: 42, 'A', \"текст\", true.",
    full: "У литерала есть тип: `42` это `int`, `4.2` это `double`, `'A'` это `char`. Разряды можно разделять подчёркиванием: `1_000_000`.",
    see: ["int", "long", "float"] },
  { id: "wrapper", term: "типы-обёртки",
    forms: ["типы-обёртки", "обёртка", "обёртки", "Integer"],
    short: "Объектные версии примитивов: Integer, Double, Boolean.",
    full: "Нужны там, где требуется объект — например в коллекциях. Могут быть `null`, и сравнивать их через `==` нельзя: сравнятся ссылки.",
    see: ["primitive", "equals"] },
  { id: "cast", term: "приведение типов", node: "2.07",
    forms: ["приведение типов", "приведение типа", "каст", "каста", "кастом", "кастовать"],
    short: "Явная смена типа значения: (int) 9.99.",
    full: "Сужающее приведение просто отрезает лишнее: `(byte) 300` даёт 44, `(int) 9.99` даёт 9. Это усечение, а не округление, и компилятор о потере не предупреждает — ты сам взял ответственность скобками.",
    see: ["widening", "narrowing", "overflow"] },
  { id: "widening", term: "расширение типа", node: "2.06",
    forms: ["расширение типа", "расширения типа", "неявное расширение", "расширяющее преобразование"],
    short: "Автоматический переход к более ёмкому типу, без потерь.",
    full: "`byte → short → int → long → float → double`, плюс `char → int`. Происходит само: `long x = 5` работает.",
    see: ["cast", "narrowing", "promotion"] },
  { id: "narrowing", term: "сужение типа", node: "2.07",
    forms: ["сужение типа", "сужающее преобразование", "сужение"],
    short: "Переход к менее ёмкому типу: только явным кастом.",
    full: "Компилятор требует скобки, потому что данные могут потеряться. `int i = 9.99` не скомпилируется, `int i = (int) 9.99` — да.",
    see: ["cast", "widening"] },
  { id: "promotion", term: "продвижение до int", node: "2.06",
    forms: ["продвижение до int", "числовое продвижение"],
    short: "Всё мельче int поднимается до int ДО вычисления.",
    full: "Поэтому `byte + byte` даёт `int`, и результат в `byte` без каста не запишется. Правило удивляет всех ровно один раз.",
    see: ["widening", "int"] },
  { id: "overflow", term: "переполнение", node: "2.11",
    forms: ["переполнение", "переполнения", "переполнении"],
    short: "Значение вышло за границы типа и завернулось по кругу.",
    full: "`Integer.MAX_VALUE + 1` даёт `Integer.MIN_VALUE`. Исключения не будет: JVM молча заворачивает число. Ловится глазами и `Math.addExact`.",
    see: ["int", "cast"] },
  { id: "precision", term: "точность дробных", node: "2.03",
    forms: ["точность", "погрешность"],
    short: "double хранит двоичную дробь, поэтому 0.1 неточен.",
    full: "Сравнивать дробные через `==` нельзя: правильный способ — `Math.abs(a - b) < 1e-9`. Для денег — `BigDecimal`.",
    see: ["double", "float"] },

  // ------------------------------------------------------------ выражения и поток
  { id: "operator", term: "оператор", node: "2.13",
    forms: ["оператор", "оператора", "операторы", "операторов"],
    short: "Знак действия: +, -, *, /, %, ==, &&.",
    full: "У операторов есть приоритет (что считается раньше) и ассоциативность (в какую сторону читается цепочка одинаковых).",
    see: ["priority", "expression"] },
  { id: "priority", term: "приоритет операций", node: "2.13",
    forms: ["приоритет операций", "приоритет операторов", "приоритета"],
    short: "Порядок, в котором операторы захватывают операнды.",
    full: "Унарные → `* / %` → `+ -` → сравнения → `&&` → `||` → присваивание. Скобки бесплатны, а нервы нет: ставь их, когда сомневаешься.",
    see: ["operator", "expression"] },
  { id: "expression", term: "выражение",
    forms: ["выражение", "выражения", "выражении", "выражений"],
    short: "Кусок кода, у которого есть значение.",
    full: "`a + 1`, `x > 0`, вызов метода с возвратом. Инструкция (statement) — это уже команда целиком, со своей точкой с запятой.",
    see: ["operator", "priority"] },
  { id: "int-div", term: "целочисленное деление", node: "2.10",
    forms: ["целочисленное деление", "целочисленного деления"],
    short: "int / int отбрасывает дробную часть.",
    full: "`7 / 2` даёт `3`, а не `3.5`. Чтобы получить дробь, хотя бы один операнд должен быть дробным: `7 / 2.0`.",
    see: ["remainder", "int"] },
  { id: "remainder", term: "остаток от деления", node: "2.10",
    forms: ["остаток от деления", "остаток", "остатка"],
    short: "Оператор % — то, что не поделилось нацело.",
    full: "Знак результата берётся от левого операнда: `-17 % 5` даёт `-2`. Отсюда типовой баг в проверке на чётность отрицательных.",
    see: ["int-div", "operator"] },
  { id: "condition", term: "условие",
    forms: ["условие", "условия", "условии"],
    short: "Выражение типа boolean, от которого зависит ветка выполнения.",
    full: "`&&` и `||` вычисляются лениво: если ответ уже ясен по левой части, правая не считается вовсе. На этом держится `if (s != null && s.isEmpty())`.",
    see: ["boolean", "ternary"] },
  { id: "ternary", term: "тернарный оператор",
    forms: ["тернарный оператор", "тернарный", "тернарника"],
    short: "условие ? одно : другое — короткий if, у которого есть значение.",
    full: "Годится ровно для выбора значения. Вкладывать друг в друга не стоит: читается хуже обычного `if`.",
    see: ["condition"] },
  { id: "loop", term: "цикл",
    forms: ["цикл", "цикла", "цикле", "циклы", "циклов"],
    short: "Повторение блока, пока держится условие.",
    full: "`while` проверяет до тела, `do-while` — после (тело выполнится минимум раз), `for` собирает счётчик, условие и шаг в одну строку.",
    see: ["break", "continue"] },
  { id: "break", term: "break", node: "2.32",
    forms: ["break"],
    short: "Немедленно выйти из цикла или switch.",
    full: "Выходит только из ближайшего цикла. Чтобы выпрыгнуть из вложенного, ставят метку: `outer:` перед циклом и `break outer`.",
    see: ["continue", "loop"] },
  { id: "continue", term: "continue", node: "2.32",
    forms: ["continue"],
    short: "Пропустить остаток тела и перейти к следующей итерации.",
    full: "В `for` перед новой проверкой выполнится шаг обновления, в `while` — сразу проверка условия. Здесь легко словить вечный цикл.",
    see: ["break", "loop"] },
  { id: "scope", term: "область видимости",
    forms: ["область видимости", "области видимости"],
    short: "Кусок кода, где имя существует.",
    full: "Переменная живёт от объявления до закрывающей скобки своего блока. Объявленная в цикле снаружи не видна.",
    see: ["block", "field"] },
  { id: "block", term: "блок",
    forms: ["блок", "блока", "блоке"],
    short: "Код в фигурных скобках.",
    full: "Задаёт область видимости. Скобки у однострочного `if` не обязательны, но без них правка кода однажды сломает логику.",
    see: ["scope"] },

  // ------------------------------------------------------------ массивы, стек, куча
  { id: "array", term: "массив", node: "2.42",
    forms: ["массив", "массива", "массиве", "массивом", "массивы", "массивов"],
    short: "Пронумерованный набор ячеек одного типа фиксированной длины.",
    full: "Длина задаётся при создании и не меняется. Индексы от 0 до `length - 1`; выход за границы — ArrayIndexOutOfBoundsException.",
    see: ["length", "array2d", "heap"] },
  { id: "length", term: "length",
    forms: ["length"],
    short: "Поле массива с его длиной. Без скобок.",
    full: "У массива `a.length`, у строки `s.length()`, у коллекции `list.size()`. Три разных написания — классический источник опечаток.",
    see: ["array", "string"] },
  { id: "array2d", term: "двумерный массив", node: "2.47",
    forms: ["двумерный массив", "двумерного массива", "двумерные массивы"],
    short: "Массив ссылок на массивы. Строки могут быть разной длины.",
    full: "`m.length` — число строк, `m[0].length` — длина первой строки. Прямоугольность никто не гарантирует: бывает рваный (jagged) массив.",
    see: ["array", "reference"] },
  { id: "stack", term: "стек", node: "2.62",
    forms: ["стек", "стека", "стеке", "стеком"],
    short: "Память под вызовы методов: по фрейму на каждый вызов.",
    full: "Во фрейме лежат параметры и локальные переменные. Метод завершился — фрейм снят. Стек свой у каждого потока и невелик.",
    see: ["heap", "call-stack", "stackoverflow"] },
  { id: "heap", term: "куча", node: "3.02",
    forms: ["куча", "кучи", "куче", "кучей"],
    short: "Память под объекты, общая для всех потоков.",
    full: "Всё, что создано через `new`, живёт здесь. Переменная на стеке хранит только ссылку в кучу. Освобождает память сборщик мусора.",
    see: ["stack", "object", "gc"] },
  { id: "call-stack", term: "стек вызовов", node: "2.62",
    forms: ["стек вызовов", "стека вызовов"],
    short: "Цепочка методов, которые сейчас выполняются.",
    full: "Внизу `main`, наверху текущий метод. Именно этот стек печатается в stack trace — сверху вниз, от места падения к `main`.",
    see: ["stack", "stack-trace", "recursion"] },
  { id: "recursion", term: "рекурсия", node: "2.62",
    forms: ["рекурсия", "рекурсии", "рекурсию"],
    short: "Метод, который вызывает сам себя.",
    full: "Нужен базовый случай — условие, при котором вызовы прекращаются. Без него стек кончится и прилетит StackOverflowError.",
    see: ["call-stack", "stackoverflow"] },
  { id: "stackoverflow", term: "StackOverflowError", node: "2.62",
    forms: ["StackOverflowError"],
    short: "Стек вызовов кончился: обычно рекурсия без выхода.",
    full: "Это Error, а не Exception: ловить его бессмысленно, надо чинить рекурсию.",
    see: ["recursion", "call-stack"] },

  // ------------------------------------------------------------ строки
  { id: "string", term: "String",
    forms: ["String", "строка", "строки", "строке", "строкой"],
    short: "Неизменяемая последовательность символов.",
    full: "Любая «правка» строки создаёт новую. Поэтому склейка в цикле — это мусор пачками, для неё есть `StringBuilder`.",
    see: ["immutable", "concat", "equals"] },
  { id: "immutable", term: "неизменяемость",
    forms: ["неизменяемость", "неизменяемый", "immutable"],
    short: "Объект, состояние которого нельзя поменять после создания.",
    full: "Такой объект безопасно передавать куда угодно и делить между потоками: испортить его нельзя.",
    see: ["string"] },
  { id: "concat", term: "конкатенация",
    forms: ["конкатенация", "конкатенации", "склейка строк"],
    short: "Склейка строк оператором +.",
    full: "Если хоть один операнд строка, второй превращается в строку: `1 + 2 + \"x\"` даёт `3x`, а `\"x\" + 1 + 2` даёт `x12`. Порядок решает.",
    see: ["string", "operator"] },
  { id: "equals", term: "equals",
    forms: ["equals"],
    short: "Сравнение по содержимому. == сравнивает ссылки.",
    full: "Для строк и объектов всегда `equals`. `==` отвечает на другой вопрос: «это один и тот же объект?». Переопределяя `equals`, обязательно переопредели и `hashCode`.",
    see: ["hashcode", "reference", "string"] },
  { id: "hashcode", term: "hashCode",
    forms: ["hashCode"],
    short: "Числовой отпечаток объекта для хеш-структур.",
    full: "Контракт: равные по `equals` объекты обязаны давать равный `hashCode`. Нарушишь — объект потеряется в `HashMap`.",
    see: ["equals"] },

  // ------------------------------------------------------------ ООП
  { id: "encapsulation", term: "инкапсуляция", node: "3.12",
    forms: ["инкапсуляция", "инкапсуляции", "инкапсуляцию"],
    short: "Поля закрыты, наружу торчат только методы.",
    full: "Смысл не в геттерах ради геттеров, а в контроле: объект сам решает, какое состояние допустимо, и не даёт положить в себя чушь.",
    see: ["getter", "private", "access-modifier"] },
  { id: "getter", term: "геттер", node: "3.12",
    forms: ["геттер", "геттера", "геттеры", "сеттер", "сеттеры"],
    short: "Метод для чтения (get) или записи (set) закрытого поля.",
    full: "Сеттер — место для проверки: отрицательный возраст можно не пустить внутрь. Геттер на изменяемый объект стоит отдавать копией.",
    see: ["encapsulation", "field"] },
  { id: "inheritance", term: "наследование",
    forms: ["наследование", "наследования", "наследует", "наследник"],
    short: "Класс берёт поля и методы родителя и добавляет своё.",
    full: "`extends`, и только один родитель. Наследование — про «является»: `Dog` является `Animal`. Если связь «состоит из», нужно поле, а не extends.",
    see: ["override", "super", "polymorphism"] },
  { id: "polymorphism", term: "полиморфизм", node: "3.25",
    forms: ["полиморфизм", "полиморфизма"],
    short: "Ссылка родительского типа, а вызывается метод настоящего объекта.",
    full: "`Animal a = new Dog(); a.sound()` вызовет версию из `Dog`. Компилятор смотрит на тип ссылки, JVM — на реальный тип объекта.",
    see: ["override", "upcast", "inheritance"] },
  { id: "abstraction", term: "абстракция",
    forms: ["абстракция", "абстракции"],
    short: "Оставить в типе только то, что важно снаружи.",
    full: "Абстрактный класс и интерфейс описывают, ЧТО умеет объект, не говоря КАК. Реализацию дают наследники.",
    see: ["abstract-class", "interface"] },
  { id: "interface", term: "интерфейс", node: "3.36",
    forms: ["интерфейс", "интерфейса", "интерфейсе", "интерфейсы"],
    short: "Контракт: набор методов без состояния.",
    full: "Реализовать можно сколько угодно интерфейсов, унаследовать — только один класс. Поля в интерфейсе — это константы, обычного состояния там нет.",
    see: ["abstract-class", "abstraction"] },
  { id: "abstract-class", term: "абстрактный класс", node: "3.32",
    forms: ["абстрактный класс", "абстрактного класса", "абстрактные классы"],
    short: "Класс, который нельзя создать: только унаследовать.",
    full: "Может хранить состояние и готовый код и при этом оставить часть методов без тела. Берут, когда у наследников есть общая реализация, а не только общий контракт.",
    see: ["interface", "inheritance"] },
  { id: "override", term: "переопределение",
    forms: ["переопределение", "переопределения", "переопределить", "переопределённый"],
    short: "Наследник заменяет метод родителя. Сигнатура та же.",
    full: "Ставь `@Override`: если промахнулся в сигнатуре, компилятор скажет об этом сразу, а не в проде.",
    see: ["overload", "annotation", "polymorphism"] },
  { id: "overload", term: "перегрузка",
    forms: ["перегрузка", "перегрузки", "перегруженный"],
    short: "Несколько методов с одним именем и разными параметрами.",
    full: "Разрешается на компиляции по типам аргументов. Не путать с переопределением: там одна сигнатура и разные классы, здесь один класс и разные сигнатуры.",
    see: ["override", "signature"] },
  { id: "static", term: "static",
    forms: ["static"],
    short: "Принадлежит классу, а не объекту.",
    full: "Статический метод вызывается без `new` и не видит полей экземпляра — ему просто неоткуда взять `this`.",
    see: ["field", "main"] },
  { id: "final", term: "final",
    forms: ["final"],
    short: "Запрет на изменение: переменной, метода или класса.",
    full: "`final` у ссылки запрещает менять ссылку, но не сам объект: список останется тем же списком, а его содержимое поменять можно.",
    see: ["immutable", "reference"] },
  { id: "access-modifier", term: "модификатор доступа", node: "3.15",
    forms: ["модификатор доступа", "модификаторы доступа", "модификатора доступа"],
    short: "Кто имеет право обратиться: private, package-private, protected, public.",
    full: "По умолчанию (без слова) — package-private: виден своему пакету. Правило простое: открывай минимум, который нужен снаружи.",
    see: ["private", "protected", "package-private", "encapsulation"] },
  { id: "private", term: "private", node: "3.15",
    forms: ["private"],
    short: "Виден только внутри своего класса.",
    full: "Даже наследник его не увидит. Состояние по умолчанию делают именно таким.",
    see: ["access-modifier", "encapsulation"] },
  { id: "protected", term: "protected", node: "3.28",
    forms: ["protected"],
    short: "Свой пакет плюс наследники в других пакетах.",
    full: "Ловушка: в другом пакете наследник видит `protected`-член только через ссылку своего типа, а не у любого объекта родителя.",
    see: ["access-modifier", "inheritance"] },
  { id: "package-private", term: "package-private", node: "3.15",
    forms: ["package-private", "пакетный доступ"],
    short: "Без модификатора: виден только своему пакету.",
    full: "Часто оказывается ровно тем, что нужно: класс-помощник не должен торчать наружу библиотеки.",
    see: ["access-modifier", "package"] },
  { id: "upcast", term: "upcasting", node: "3.25",
    forms: ["upcasting", "восходящее приведение", "апкаст"],
    short: "Ссылка на родительский тип. Безопасно и без скобок.",
    full: "`Animal a = new Dog()`. Через такую ссылку видно только то, что объявлено в `Animal`, но вызовется реализация из `Dog`.",
    see: ["downcast", "polymorphism"] },
  { id: "downcast", term: "downcasting", node: "3.25",
    forms: ["downcasting", "нисходящее приведение", "даункаст"],
    short: "Обратное приведение к наследнику. Только явно и с риском.",
    full: "Если объект не того типа, будет ClassCastException. Проверяй через `instanceof`, лучше сразу с pattern matching.",
    see: ["upcast", "cce", "instanceof"] },
  { id: "cce", term: "ClassCastException",
    forms: ["ClassCastException"],
    short: "Привели ссылку к типу, которым объект не является.",
    full: "Ошибка времени выполнения. Каст не меняет объект — он меняет только очки, через которые на него смотрят.",
    see: ["downcast", "runtime-error"] },
  { id: "instanceof", term: "instanceof",
    forms: ["instanceof"],
    short: "Проверка реального типа объекта.",
    full: "`if (o instanceof Dog d)` сразу заводит переменную нужного типа — отдельный каст не нужен.",
    see: ["downcast"] },
  { id: "nested-class", term: "вложенный класс", node: "3.48",
    forms: ["вложенный класс", "вложенные классы", "вложенного класса"],
    short: "Класс внутри класса. Статический — без связи с внешним объектом.",
    full: "`static` вложенный живёт сам по себе. Внутренний (без `static`) держит скрытую ссылку на внешний объект и без него не создаётся.",
    see: ["inner-class", "anonymous-class"] },
  { id: "inner-class", term: "внутренний класс", node: "3.49",
    forms: ["внутренний класс", "внутренние классы", "внутреннего класса"],
    short: "Нестатический вложенный: видит поля внешнего объекта.",
    full: "Создаётся только от экземпляра: `outer.new Inner()`. Скрытая ссылка на внешний объект мешает ему быть собранным мусорщиком.",
    see: ["nested-class", "anonymous-class"] },
  { id: "anonymous-class", term: "анонимный класс", node: "3.51",
    forms: ["анонимный класс", "анонимные классы", "анонимного класса"],
    short: "Класс без имени, объявленный прямо в месте создания.",
    full: "`new Runnable() { ... }` — объявление и создание одним выражением. Видит effectively final локальные переменные окружающего метода.",
    see: ["inner-class", "interface"] },
  { id: "record", term: "record",
    forms: ["record", "рекорд"],
    short: "Короткая запись неизменяемого носителя данных.",
    full: "`record Point(int x, int y) {}` — компилятор сам напишет конструктор, геттеры, `equals`, `hashCode` и `toString`.",
    see: ["immutable", "equals"] },
  { id: "enum", term: "enum",
    forms: ["enum", "перечисление"],
    short: "Тип с конечным списком именованных значений.",
    full: "Это полноценные объекты: у них бывают поля и методы. В `switch` компилятор проверит, что разобраны все варианты.",
    see: ["class"] },
  { id: "sealed", term: "sealed", node: "3.44",
    forms: ["sealed"],
    short: "Класс, у которого список наследников закрыт и перечислен.",
    full: "`sealed ... permits A, B` — иерархию нельзя расширить снаружи. Компилятор знает все варианты и проверяет полноту `switch`.",
    see: ["inheritance", "enum"] },

  // ------------------------------------------------------------ ошибки
  { id: "compile-error", term: "ошибка компиляции", node: "1.19",
    forms: ["ошибка компиляции", "ошибки компиляции", "ошибку компиляции"],
    short: "Поймал javac: программа даже не запустится.",
    full: "Синтаксис, несовпадение типов, забытый `return`. Хорошая новость: такие ошибки бесплатны — их видно до запуска.",
    see: ["runtime-error", "javac"] },
  { id: "runtime-error", term: "ошибка выполнения", node: "1.19",
    forms: ["ошибка выполнения", "ошибки выполнения", "ошибку выполнения"],
    short: "Всплыла на запуске: NPE, деление на ноль, выход за границы.",
    full: "«Скомпилировалось» не равно «работает»: компилятор проверяет типы, а не смысл.",
    see: ["compile-error", "exception", "npe"] },
  { id: "exception", term: "исключение",
    forms: ["исключение", "исключения", "исключений", "исключением"],
    short: "Объект, описывающий сбой: летит вверх по стеку до обработчика.",
    full: "Не поймали — программа падает и печатает stack trace. Ловят `try/catch`, `finally` выполняется в любом случае.",
    see: ["stack-trace", "runtime-error", "npe"] },
  { id: "stack-trace", term: "stack trace", node: "1.21",
    forms: ["stack trace", "стектрейс", "трейс", "трейса"],
    short: "Печать стека вызовов в момент падения.",
    full: "Верхняя строка — где упало, нижняя — `main`. Ищи первую строку со своим пакетом: чужие кадры из JDK почти всегда не твой баг.",
    see: ["call-stack", "exception"] },
  { id: "annotation", term: "аннотация",
    forms: ["аннотация", "аннотации", "аннотацию"],
    short: "Пометка для компилятора или библиотеки: @Override, @Test.",
    full: "Сама по себе ничего не делает — смысл ей придаёт тот, кто её читает: компилятор, JUnit, Spring.",
    see: ["override"] },
];

/* ---------------------------------------------------------------- индекс */

const BY_ID = new Map(TERMS.map((t) => [t.id, t]));

// Формы сортируем по длине: «двумерный массив» должен выиграть у «массив».
const FORMS = TERMS
  .flatMap((t) => (t.forms || [t.term]).map((form) => ({ form, term: t })))
  .sort((a, b) => b.form.length - a.form.length);

export function lookup(word) {
  const needle = String(word || "").trim().toLowerCase();
  if (!needle) return null;
  const hit = FORMS.find((f) => f.form.toLowerCase() === needle);
  return hit ? hit.term : null;
}

function esc(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** В коротких определениях допускаем `код` в обратных кавычках. */
function fmt(text) {
  return esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

/* ---------------------------------------------------------------- стили */

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.gl-term {
  font: inherit; color: inherit; background: none; padding: 0; margin: 0;
  border: 0; border-bottom: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--line));
  cursor: help; line-height: inherit;
}
.gl-term:hover { border-bottom-style: solid; border-bottom-color: var(--accent); }
.gl-tip {
  position: absolute; z-index: 60; max-width: 340px;
  padding: 12px 14px; border-radius: 12px;
  background: var(--card); color: var(--ink);
  border: 1px solid var(--line); box-shadow: var(--shadow-2);
  font-family: var(--font-ui); font-size: 13.4px; line-height: 1.5;
  opacity: 0; transform: translateY(4px) scale(.96); pointer-events: none;
  transition: opacity .16s var(--ease), transform .16s var(--ease);
}
.gl-tip.on { opacity: 1; transform: none; pointer-events: auto; }
.gl-tip b.t { display: block; font-size: 14px; margin-bottom: 4px; }
.gl-tip code { font-family: var(--font-mono); font-size: .88em;
  background: var(--sunk); border-radius: 4px; padding: .05em .3em; }
.gl-tip .row { display: flex; flex-wrap: wrap; DEMO_PROJECT: 6px; margin-top: 10px; }
.gl-tip button {
  border: 1px solid var(--line); background: var(--paper); color: var(--muted);
  border-radius: 99px; padding: 3px 9px; font-size: 11.5px; cursor: pointer;
}
.gl-tip button:hover { color: var(--ink); border-color: var(--accent); }
.gl-tip button.node { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }

.gl-scrim { position: fixed; inset: 0; z-index: 70;
  background: color-mix(in srgb, var(--ink) 34%, transparent);
  opacity: 0; transition: opacity .16s var(--ease); }
.gl-scrim.on { opacity: 1; }
.gl-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 71;
  width: min(380px, 100vw); display: flex; flex-direction: column;
  background: var(--card); border-left: 1px solid var(--line); box-shadow: var(--shadow-2);
  transform: translateX(100%); transition: transform .34s var(--ease);
  font-family: var(--font-ui);
}
.gl-panel.on { transform: none; }
.gl-panel header { display: flex; align-items: center; DEMO_PROJECT: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--line); }
.gl-panel header h3 { margin: 0; font-size: 15px; font-weight: 650; }
.gl-panel header button { margin-left: auto; border: 0; background: none;
  color: var(--muted); font-size: 20px; cursor: pointer; line-height: 1; }
.gl-panel .find { padding: 12px 16px; border-bottom: 1px solid var(--line); }
.gl-panel .find input {
  width: 100%; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px;
  background: var(--paper); color: var(--ink); font: inherit; font-size: 14px;
}
.gl-panel .list { overflow: auto; padding: 8px 8px 40px; flex: 1 1 auto; }
.gl-letter { font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--muted); font-weight: 650; padding: 14px 8px 6px; }
.gl-item { width: 100%; text-align: left; border: 0; background: none; cursor: pointer;
  padding: 9px 10px; border-radius: 9px; color: var(--ink); }
.gl-item:hover { background: var(--sunk); }
.gl-item b { display: block; font-size: 14px; }
.gl-item span { display: block; color: var(--muted); font-size: 12.6px; line-height: 1.45; }
.gl-item .more { margin-top: 7px; color: var(--ink-soft); font-size: 13px; line-height: 1.55; }
.gl-empty { padding: 30px 16px; color: var(--muted); font-size: 13.5px; text-align: center; }
@media (prefers-reduced-motion: reduce) {
  .gl-tip, .gl-panel, .gl-scrim { transition: none; }
}`;
  document.head.appendChild(style);
}

/* ---------------------------------------------------------------- разметка текста */

const SKIP = "code, pre, a, h1, h2, h3, h4, button, .no-gloss, .gl-term, .figure, .check .opts";

export function attachGlossary(root, opts = {}) {
  if (!root || opts.enabled === false) return () => {};
  injectStyles();

  const used = new Set();
  const wrapped = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.length < 3) return NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const texts = [];
  let node = walker.nextNode();
  while (node) { texts.push(node); node = walker.nextNode(); }

  for (const text of texts) {
    if (used.size === TERMS.length) break;
    const value = text.nodeValue;
    // Ищем самое раннее вхождение ещё не использованного термина.
    let best = null;
    for (const { form, term } of FORMS) {
      if (used.has(term.id)) continue;
      const at = indexOfWord(value, form);
      if (at >= 0 && (!best || at < best.at || (at === best.at && form.length > best.form.length))) {
        best = { at, form, term };
      }
    }
    if (!best) continue;

    used.add(best.term.id);
    const after = text.splitText(best.at);
    after.splitText(best.form.length);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gl-term";
    button.dataset.term = best.term.id;
    button.textContent = after.nodeValue;
    after.parentNode.replaceChild(button, after);
    wrapped.push(button);
  }

  const tip = makeTooltip(root, opts);
  return () => {
    tip.destroy();
    wrapped.forEach((el) => {
      const text = document.createTextNode(el.textContent);
      el.parentNode?.replaceChild(text, el);
      text.parentNode?.normalize();
    });
  };
}

/** Вхождение как отдельного слова: «int» не должен ловиться внутри «print». */
function indexOfWord(text, form) {
  const lower = text.toLowerCase();
  const needle = form.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) return -1;
    const before = at === 0 ? "" : text[at - 1];
    const after = text[at + needle.length] || "";
    if (!isWordChar(before) && !isWordChar(after)) return at;
    from = at + 1;
  }
}

function isWordChar(ch) { return Boolean(ch) && /[0-9A-Za-zА-Яа-яЁё_$]/.test(ch); }

/* ---------------------------------------------------------------- тултип */

function makeTooltip(root, opts) {
  const tip = document.createElement("div");
  tip.className = "gl-tip";
  document.body.appendChild(tip);
  let openFor = null;
  let hoverTimer = null;

  function paint(term) {
    const links = (term.see || []).map((id) => BY_ID.get(id)).filter(Boolean);
    tip.innerHTML = `<b class="t">${esc(term.term)}</b>${fmt(term.short)}
      <div class="row">
        ${links.map((l) => `<button type="button" data-see="${l.id}">${esc(l.term)}</button>`).join("")}
        ${term.node ? `<button type="button" class="node" data-node="${term.node}">разбор в ${term.node}</button>` : ""}
      </div>`;
  }

  function place(anchor) {
    const rect = anchor.getBoundingClientRect();
    tip.style.visibility = "hidden";
    tip.classList.add("on");
    const box = tip.getBoundingClientRect();
    const below = rect.bottom + 8 + box.height < window.innerHeight;
    const top = below ? rect.bottom + 8 : rect.top - box.height - 8;
    let left = rect.left + rect.width / 2 - box.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - box.width - 12));
    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${top + window.scrollY}px`;
    // Origin-aware: всплывает от самого термина, а не из ниоткуда.
    const originX = Math.max(0, Math.min(rect.left + rect.width / 2 - left, box.width));
    tip.style.transformOrigin = `${originX}px ${below ? "0%" : "100%"}`;
    tip.style.visibility = "";
  }

  function show(anchor, term) {
    openFor = anchor;
    paint(term);
    tip.classList.remove("on");
    place(anchor);
    requestAnimationFrame(() => tip.classList.add("on"));
  }

  function hide() {
    openFor = null;
    tip.classList.remove("on");
  }

  const onOver = (e) => {
    const el = e.target.closest(".gl-term");
    if (!el || !root.contains(el)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => show(el, BY_ID.get(el.dataset.term)), 120);
  };
  const onOut = (e) => {
    if (!e.target.closest?.(".gl-term")) return;
    clearTimeout(hoverTimer);
    setTimeout(() => { if (!tip.matches(":hover")) hide(); }, 140);
  };
  const onClick = (e) => {
    const el = e.target.closest(".gl-term");
    if (el && root.contains(el)) {
      e.preventDefault();
      clearTimeout(hoverTimer);
      if (openFor === el) hide(); else show(el, BY_ID.get(el.dataset.term));
      return;
    }
    if (!e.target.closest(".gl-tip")) hide();
  };
  const onKey = (e) => { if (e.key === "Escape") hide(); };

  tip.addEventListener("click", (e) => {
    const see = e.target.closest("[data-see]");
    if (see && openFor) { show(openFor, BY_ID.get(see.dataset.see)); return; }
    const node = e.target.closest("[data-node]");
    if (node) { hide(); opts.onOpenNode?.(node.dataset.node); }
  });
  tip.addEventListener("mouseleave", hide);

  root.addEventListener("mouseover", onOver);
  root.addEventListener("mouseout", onOut);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", hide, { passive: true });

  return {
    destroy() {
      clearTimeout(hoverTimer);
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide);
      tip.remove();
    },
  };
}

/* ---------------------------------------------------------------- панель */

export function openGlossaryPanel(opts = {}) {
  injectStyles();
  const opener = document.activeElement;

  const scrim = document.createElement("div");
  scrim.className = "gl-scrim";
  const panel = document.createElement("div");
  panel.className = "gl-panel";
  panel.innerHTML = `
    <header><h3>Глоссарий</h3><button type="button" aria-label="закрыть">×</button></header>
    <div class="find"><input type="search" placeholder="найти термин" autocomplete="off"></div>
    <div class="list"></div>`;
  document.body.append(scrim, panel);
  requestAnimationFrame(() => { scrim.classList.add("on"); panel.classList.add("on"); });

  const list = panel.querySelector(".list");
  const input = panel.querySelector("input");
  let openId = null;

  function render(query) {
    const needle = (query || "").trim().toLowerCase();
    const found = TERMS.filter((t) => !needle
      || t.term.toLowerCase().includes(needle)
      || (t.forms || []).some((f) => f.toLowerCase().includes(needle))
      || t.short.toLowerCase().includes(needle)
      || t.full.toLowerCase().includes(needle));
    if (!found.length) { list.innerHTML = '<div class="gl-empty">ничего не нашлось</div>'; return; }

    const sorted = [...found].sort((a, b) => a.term.localeCompare(b.term, "ru"));
    let letter = "";
    list.innerHTML = sorted.map((t) => {
      const first = t.term[0].toUpperCase();
      const head = first === letter ? "" : `<div class="gl-letter">${esc(first)}</div>`;
      letter = first;
      const open = openId === t.id;
      return `${head}<button class="gl-item" type="button" data-id="${t.id}">
        <b>${esc(t.term)}</b><span>${fmt(t.short)}</span>
        ${open ? `<div class="more">${fmt(t.full)}
          ${t.node ? `<div style="margin-top:8px"><b data-node="${t.node}"
            style="color:var(--accent);cursor:pointer">разбор в ноде ${t.node} →</b></div>` : ""}</div>` : ""}
      </button>`;
    }).join("");
  }

  render("");
  input.focus();
  input.addEventListener("input", () => { openId = null; render(input.value); });

  list.addEventListener("click", (e) => {
    const node = e.target.closest("[data-node]");
    if (node) { close(); opts.onOpenNode?.(node.dataset.node); return; }
    const item = e.target.closest(".gl-item");
    if (!item) return;
    openId = openId === item.dataset.id ? null : item.dataset.id;
    render(input.value);
  });

  function close() {
    scrim.classList.remove("on");
    panel.classList.remove("on");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => { scrim.remove(); panel.remove(); }, 320);
    opener?.focus?.();
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  scrim.addEventListener("click", close);
  panel.querySelector("header button").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  return close;
}
