import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class WaveHiddenTest {

    private int[][] warehouse() {
        return new int[][] {{10, 0, 5}, {3, 7}};
    }

    @Test
    @DisplayName("остаток по всему складу считается по всем проходам")
    void totalStockSumsEverything() {
        assertEquals(25, Wave.totalStock(warehouse()));
        assertEquals(0, Wave.totalStock(new int[0][]));
        assertEquals(0, Wave.totalStock(new int[][] {{}, {}}));
    }

    @Test
    @DisplayName("отбор идёт змейкой: чётный проход слева направо, нечётный справа налево")
    void pickGoesSerpentine() {
        assertArrayEquals(
                new int[][] {{0, 0, 10}, {0, 2, 5}, {1, 1, 1}},
                Wave.pick(warehouse(), 16));
    }

    @Test
    @DisplayName("хватило первой ячейки: план из одной строки")
    void pickStopsWhenEnough() {
        assertArrayEquals(new int[][] {{0, 0, 8}}, Wave.pick(warehouse(), 8));
    }

    @Test
    @DisplayName("пустые ячейки в план не попадают")
    void pickSkipsEmptyCells() {
        int[][] plan = Wave.pick(new int[][] {{0, 0, 4}}, 4);
        assertArrayEquals(new int[][] {{0, 2, 4}}, plan);
    }

    @Test
    @DisplayName("товара меньше, чем просят: собирается всё, что есть")
    void pickTakesEverythingAvailable() {
        int[][] plan = Wave.pick(warehouse(), 100);
        int qty = 0;
        for (int[] line : plan) {
            qty += line[2];
        }
        assertEquals(25, qty);
    }

    @Test
    @DisplayName("нулевая потребность даёт пустой план, склад при этом не меняется")
    void pickKeepsStockUntouched() {
        int[][] stock = warehouse();
        assertEquals(0, Wave.pick(stock, 0).length);
        Wave.pick(stock, 16);
        assertArrayEquals(new int[][] {{10, 0, 5}, {3, 7}}, stock);
    }

    @Test
    @DisplayName("волны считаются с округлением вверх и без дробей")
    void wavesRoundUp() {
        assertEquals(0, Wave.waves(0, 10));
        assertEquals(1, Wave.waves(1, 10));
        assertEquals(2, Wave.waves(16, 10));
        assertEquals(2, Wave.waves(20, 10));
        assertEquals(3, Wave.waves(21, 10));
        assertEquals(100000000, Wave.waves(1000000000, 10));
    }

    @Test
    @DisplayName("маршрут нумерует проходы и ячейки с единицы")
    void routeIsHumanNumbered() {
        assertEquals("1.1x10;1.3x5;2.2x1", Wave.route(Wave.pick(warehouse(), 16)));
        assertEquals("", Wave.route(new int[0][]));
    }

    @Test
    @DisplayName("вердикт строки заказа зависит от того, сколько собрали")
    void verdictDependsOnPicked() {
        assertEquals("OK", Wave.verdict(16, 16));
        assertEquals("OK", Wave.verdict(16, 20));
        assertEquals("PARTIAL", Wave.verdict(20, 16));
        assertEquals("NOSTOCK", Wave.verdict(5, 0));
    }

    @Test
    @DisplayName("код строки заказа переводится в текст для оператора")
    void statusTextTranslatesCode() {
        assertEquals("собрано", Wave.statusText("OK"));
        assertEquals("собрано частично", Wave.statusText("PARTIAL"));
        assertEquals("нет остатка", Wave.statusText("NOSTOCK"));
    }

    @Test
    @DisplayName("сообщение в ERP собирается по формату")
    void messageMatchesFormat() {
        int[][] plan = Wave.pick(warehouse(), 16);
        assertEquals("ORDER=A-100;LINES=3;QTY=16;WAVES=2;ROUTE=1.1x10;1.3x5;2.2x1",
                Wave.message("A-100", plan, 10));
        assertEquals("ORDER=A-100;LINES=0;QTY=0;WAVES=0;ROUTE=",
                Wave.message("A-100", new int[0][], 10));
    }

    @Test
    @DisplayName("короткая форма сообщения берёт вместимость по умолчанию")
    void messageOverloadUsesDefaultCapacity() {
        int[][] plan = Wave.pick(warehouse(), 16);
        assertEquals(Wave.message("A-100", plan, 10), Wave.message("A-100", plan));
    }

    @Test
    @DisplayName("кривой вход роняет метод исключением, а не возвращает ноль")
    void badInputThrows() {
        assertThrows(IllegalArgumentException.class, () -> Wave.totalStock(null));
        assertThrows(IllegalArgumentException.class,
                () -> Wave.totalStock(new int[][] {{1, -2}}));
        assertThrows(IllegalArgumentException.class, () -> Wave.pick(warehouse(), -1));
        assertThrows(IllegalArgumentException.class, () -> Wave.waves(10, 0));
        assertThrows(IllegalArgumentException.class, () -> Wave.waves(-1, 10));
        assertThrows(IllegalArgumentException.class, () -> Wave.statusText("ЧТОТО"));
        assertThrows(IllegalArgumentException.class, () -> Wave.statusText(null));
        assertThrows(IllegalArgumentException.class,
                () -> Wave.message("", new int[0][], 10));
    }
}
