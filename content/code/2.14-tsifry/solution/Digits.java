public class Digits {

    public static int sum(int number) {
        int rest = Math.abs(number);
        int total = 0;
        while (rest > 0) {
            total += rest % 10;
            rest /= 10;
        }
        return total;
    }

    public static int count(int number) {
        int rest = Math.abs(number);
        int digits = 1;
        while (rest >= 10) {
            rest /= 10;
            digits++;
        }
        return digits;
    }

    public static void main(String[] args) {
        System.out.println(sum(1234) + " " + count(1234));
    }
}
