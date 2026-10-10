import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DigitsHiddenTest {

    @Test
    @DisplayName("ноль это одна цифра")
    void zero() {
        assertEquals(0, Digits.sum(0));
        assertEquals(1, Digits.count(0));
    }

    @Test
    @DisplayName("минус не считается цифрой")
    void negative() {
        assertEquals(6, Digits.sum(-123));
        assertEquals(3, Digits.count(-123));
    }

    @Test
    @DisplayName("нули внутри числа считаются")
    void innerZeros() {
        assertEquals(1, Digits.sum(1000));
        assertEquals(4, Digits.count(1000));
    }

    @Test
    @DisplayName("большое число")
    void bigNumber() {
        assertEquals(45, Digits.sum(1234567890));
        assertEquals(10, Digits.count(1234567890));
    }

    @Test
    @DisplayName("большое отрицательное число")
    void bigNegative() {
        assertEquals(45, Digits.sum(-1234567890));
        assertEquals(10, Digits.count(-1234567890));
    }
}
