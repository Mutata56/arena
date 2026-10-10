import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DigitsTest {

    @Test
    @DisplayName("сумма цифр обычного числа")
    void sumOfPlainNumber() {
        assertEquals(10, Digits.sum(1234));
    }

    @Test
    @DisplayName("количество цифр обычного числа")
    void countOfPlainNumber() {
        assertEquals(4, Digits.count(1234));
    }

    @Test
    @DisplayName("однозначное число")
    void singleDigit() {
        assertEquals(7, Digits.sum(7));
        assertEquals(1, Digits.count(7));
    }
}
