import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FrameTest {

    @Test
    @DisplayName("рамка вокруг короткого слова")
    void shortWord() {
        assertEquals("+----+\n| ок |\n+----+", Frame.box("ок"));
    }

    @Test
    @DisplayName("рамка вокруг слова из шести букв")
    void sixLetters() {
        assertEquals("+--------+\n| привет |\n+--------+", Frame.box("привет"));
    }
}
