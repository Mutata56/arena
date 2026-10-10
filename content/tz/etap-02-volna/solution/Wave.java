import java.util.Arrays;

/**
 * Планировщик волны отбора.
 *
 * Обход склада живёт в одном методе pick, а route и message работают уже
 * с готовым планом: копировать змейку в три места незачем.
 */
public class Wave {

    /** Вместимость тележки по умолчанию, штук. */
    static final int DEFAULT_CAPACITY = 10;

    static int totalStock(int[][] stock) {
        requireStock(stock);
        int sum = 0;
        for (int[] aisle : stock) {
            for (int qty : aisle) {
                sum += qty;
            }
        }
        return sum;
    }

    static int[][] pick(int[][] stock, int need) {
        requireStock(stock);
        if (need < 0) {
            throw new IllegalArgumentException("нужное количество не может быть отрицательным");
        }
        int[][] plan = new int[cellCount(stock)][3];
        int lines = 0;
        int left = need;
        for (int aisle = 0; aisle < stock.length && left > 0; aisle++) {
            int[] row = stock[aisle];
            for (int step = 0; step < row.length && left > 0; step++) {
                int cell = aisle % 2 == 0 ? step : row.length - 1 - step;
                int take = Math.min(row[cell], left);
                if (take <= 0) {
                    continue;
                }
                plan[lines][0] = aisle;
                plan[lines][1] = cell;
                plan[lines][2] = take;
                lines++;
                left -= take;
            }
        }
        return Arrays.copyOf(plan, lines);
    }

    static int waves(int picked, int capacity) {
        if (picked < 0) {
            throw new IllegalArgumentException("снятое количество не может быть отрицательным");
        }
        if (capacity < 1) {
            throw new IllegalArgumentException("вместимость тележки меньше единицы");
        }
        return (picked + capacity - 1) / capacity;
    }

    static String route(int[][] picks) {
        requirePicks(picks);
        StringBuilder text = new StringBuilder();
        for (int[] line : picks) {
            if (text.length() > 0) {
                text.append(';');
            }
            text.append(line[0] + 1).append('.').append(line[1] + 1).append('x').append(line[2]);
        }
        return text.toString();
    }

    static String verdict(int need, int picked) {
        if (need < 0 || picked < 0) {
            throw new IllegalArgumentException("количество не может быть отрицательным");
        }
        if (picked >= need) {
            return "OK";
        }
        return picked == 0 ? "NOSTOCK" : "PARTIAL";
    }

    static String statusText(String code) {
        if (code == null) {
            throw new IllegalArgumentException("код строки заказа не задан");
        }
        switch (code) {
            case "OK":
                return "собрано";
            case "PARTIAL":
                return "собрано частично";
            case "NOSTOCK":
                return "нет остатка";
            default:
                throw new IllegalArgumentException("неизвестный код строки заказа: " + code);
        }
    }

    static String message(String order, int[][] picks, int capacity) {
        if (order == null || order.trim().isEmpty()) {
            throw new IllegalArgumentException("номер заказа пуст");
        }
        requirePicks(picks);
        if (capacity < 1) {
            throw new IllegalArgumentException("вместимость тележки меньше единицы");
        }
        int qty = pickedQty(picks);
        return "ORDER=" + order
                + ";LINES=" + picks.length
                + ";QTY=" + qty
                + ";WAVES=" + waves(qty, capacity)
                + ";ROUTE=" + route(picks);
    }

    static String message(String order, int[][] picks) {
        return message(order, picks, DEFAULT_CAPACITY);
    }

    /** Сколько штук всего снято по плану. */
    static int pickedQty(int[][] picks) {
        requirePicks(picks);
        int qty = 0;
        for (int[] line : picks) {
            qty += line[2];
        }
        return qty;
    }

    /** Сколько всего ячеек на складе: столько строк плана хватит в самом худшем случае. */
    static int cellCount(int[][] stock) {
        int cells = 0;
        for (int[] aisle : stock) {
            cells += aisle.length;
        }
        return cells;
    }

    static void requireStock(int[][] stock) {
        if (stock == null) {
            throw new IllegalArgumentException("склад не задан");
        }
        for (int[] aisle : stock) {
            if (aisle == null) {
                throw new IllegalArgumentException("проход не задан");
            }
            for (int qty : aisle) {
                if (qty < 0) {
                    throw new IllegalArgumentException("отрицательный остаток в ячейке");
                }
            }
        }
    }

    static void requirePicks(int[][] picks) {
        if (picks == null) {
            throw new IllegalArgumentException("план отбора не задан");
        }
        for (int[] line : picks) {
            if (line == null || line.length != 3) {
                throw new IllegalArgumentException("строка плана должна быть из трёх чисел");
            }
        }
    }
}
