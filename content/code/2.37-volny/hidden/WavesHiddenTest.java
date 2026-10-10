import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WavesHiddenTest {

    @Test
    @DisplayName("ноль строк это ноль волн и пустая раскладка")
    void nothingToPick() {
        assertEquals(0, Waves.count(0, 5));
        assertEquals("", Waves.plan(0, 5));
    }

    @Test
    @DisplayName("одна неполная волна")
    void singleShortWave() {
        assertEquals(1, Waves.count(3, 5));
        assertEquals("3", Waves.plan(3, 5));
    }

    @Test
    @DisplayName("волна размером в одну строку")
    void sizeOne() {
        assertEquals(4, Waves.count(4, 1));
        assertEquals("1+1+1+1", Waves.plan(4, 1));
    }

    @Test
    @DisplayName("размер волны меньше единицы это ошибка")
    void badSize() {
        assertThrows(IllegalArgumentException.class, () -> Waves.count(10, 0));
        assertThrows(IllegalArgumentException.class, () -> Waves.plan(10, -1));
    }

    @Test
    @DisplayName("отрицательное количество строк это ошибка")
    void badTotal() {
        assertThrows(IllegalArgumentException.class, () -> Waves.count(-1, 5));
        assertThrows(IllegalArgumentException.class, () -> Waves.plan(-7, 5));
    }

    @Test
    @DisplayName("большое количество строк не ломает счёт")
    void bigOrder() {
        assertEquals(200000, Waves.count(1000000, 5));
        assertEquals(333334, Waves.count(1000000, 3));
    }
}
