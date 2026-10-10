import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/**
 * Мои тесты к волне отбора. Гоняю их сам, до сдачи.
 */
class WaveTest {

    private final int[][] stock = {{10, 0, 5}, {3, 7}};

    @Test
    void пустойСкладНичегоНеДаёт() {
        assertEquals(0, Wave.totalStock(new int[][] {{0, 0}, {0}}));
        assertEquals(0, Wave.pick(new int[][] {{0, 0}}, 5).length);
    }

    @Test
    void остатокСчитаетсяПоВсемПроходам() {
        assertEquals(25, Wave.totalStock(stock));
    }

    @Test
    void второйПроходИдёКлиент CраваНалево() {
        int[][] plan = Wave.pick(stock, 16);
        assertArrayEquals(new int[] {1, 1, 1}, plan[plan.length - 1]);
    }

    @Test
    void нехваткаОстаткаЭтоЧастичныйОтбор() {
        int[][] plan = Wave.pick(stock, 100);
        assertEquals("PARTIAL", Wave.verdict(100, Wave.pickedQty(plan)));
    }

    @Test
    void границыВместимости() {
        assertEquals(1, Wave.waves(10, 10));
        assertEquals(2, Wave.waves(11, 10));
        assertEquals(0, Wave.waves(0, 10));
    }

    @Test
    void маршрутПустогоПланаЭтоПустаяСтрока() {
        assertEquals("", Wave.route(new int[0][]));
    }

    @Test
    void нулеваяВместимостьЭтоОшибкаВызова() {
        assertThrows(IllegalArgumentException.class, () -> Wave.waves(5, 0));
    }
}
