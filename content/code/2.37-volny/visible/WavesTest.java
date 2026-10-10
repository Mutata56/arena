import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WavesTest {

    @Test
    @DisplayName("двенадцать строк по пять это три волны")
    void threeWaves() {
        assertEquals(3, Waves.count(12, 5));
    }

    @Test
    @DisplayName("раскладка неполной последней волны")
    void planWithTail() {
        assertEquals("5+5+2", Waves.plan(12, 5));
    }

    @Test
    @DisplayName("ровное деление без хвоста")
    void planWithoutTail() {
        assertEquals("5+5", Waves.plan(10, 5));
        assertEquals(2, Waves.count(10, 5));
    }
}
