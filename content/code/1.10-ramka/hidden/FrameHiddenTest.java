import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class FrameHiddenTest {

    @Test
    @DisplayName("пустой текст тоже попадает в рамку")
    void emptyText() {
        assertEquals("+--+\n|  |\n+--+", Frame.box(""));
    }

    @Test
    @DisplayName("все три строки одинаковой длины")
    void sameWidth() {
        String[] lines = Frame.box("склад").split("\n");
        assertEquals(3, lines.length);
        assertEquals(lines[0].length(), lines[1].length());
        assertEquals(lines[1].length(), lines[2].length());
    }

    @Test
    @DisplayName("пробел внутри текста не ломает ширину")
    void textWithSpace() {
        assertEquals("+---------+\n| два три |\n+---------+", Frame.box("два три"));
    }

    @Test
    @DisplayName("в конце нет лишнего перевода строки")
    void noTrailingNewline() {
        assertFalse(Frame.box("а").endsWith("\n"));
    }

    @Test
    @DisplayName("длинная строка обрамляется целиком")
    void longText() {
        String text = "ячейка A-01-02-03";
        String[] lines = Frame.box(text).split("\n");
        assertEquals("| " + text + " |", lines[1]);
        assertEquals(text.length() + 4, lines[0].length());
    }
}
