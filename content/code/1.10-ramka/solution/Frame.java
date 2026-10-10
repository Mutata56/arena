public class Frame {

    public static String box(String text) {
        String edge = "+" + "-".repeat(text.length() + 2) + "+";
        return edge + "\n| " + text + " |\n" + edge;
    }

    public static void main(String[] args) {
        System.out.println(box("привет"));
    }
}
