public class Waves {

    public static int count(int total, int size) {
        check(total, size);
        return (total + size - 1) / size;
    }

    public static String plan(int total, int size) {
        check(total, size);
        StringBuilder out = new StringBuilder();
        int rest = total;
        while (rest > 0) {
            int wave = Math.min(size, rest);
            if (out.length() > 0) {
                out.append('+');
            }
            out.append(wave);
            rest -= wave;
        }
        return out.toString();
    }

    private static void check(int total, int size) {
        if (size < 1) {
            throw new IllegalArgumentException("размер волны должен быть больше нуля");
        }
        if (total < 0) {
            throw new IllegalArgumentException("количество строк не бывает отрицательным");
        }
    }

    public static void main(String[] args) {
        System.out.println(count(12, 5) + " волны: " + plan(12, 5));
    }
}
