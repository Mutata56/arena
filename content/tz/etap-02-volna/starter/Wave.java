/**
 * Планировщик волны отбора.
 *
 * Каркас: сигнатуры менять нельзя, их зовут скрытые тесты. Всё остальное твоё,
 * включая вспомогательные методы, которых здесь нет.
 */
public class Wave {

    /** Вместимость тележки по умолчанию, штук. */
    static final int DEFAULT_CAPACITY = 10;

    /** Суммарный остаток по всему складу. */
    static int totalStock(int[][] stock) {
        throw new UnsupportedOperationException("напиши меня");
    }

    /** План отбора змейкой: строки вида {проход, ячейка, сколько снять}. */
    static int[][] pick(int[][] stock, int need) {
        throw new UnsupportedOperationException("напиши меня");
    }

    /** Сколько волн нужно, чтобы вывезти picked штук тележкой на capacity. */
    static int waves(int picked, int capacity) {
        throw new UnsupportedOperationException("напиши меня");
    }

    /** Маршрут одной строкой: 1.3x5;2.1x3 */
    static String route(int[][] picks) {
        throw new UnsupportedOperationException("напиши меня");
    }

    /** Код строки заказа: OK, PARTIAL или NOSTOCK. */
    static String verdict(int need, int picked) {
        throw new UnsupportedOperationException("напиши меня");
    }

    /** Текст кода для оператора. Здесь ждут switch, а не цепочку if else. */
    static String statusText(String code) {
        throw new UnsupportedOperationException("напиши меня");
    }

    /** Интеграционное сообщение для ERP. */
    static String message(String order, int[][] picks, int capacity) {
        throw new UnsupportedOperationException("напиши меня");
    }

    /** То же сообщение, но с вместимостью тележки по умолчанию. */
    static String message(String order, int[][] picks) {
        throw new UnsupportedOperationException("напиши меня");
    }
}
