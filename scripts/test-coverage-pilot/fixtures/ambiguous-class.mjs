export function run() {
  class A {
    foo = 1;
    bar = () => 2;
    method() {
      return 3;
    }
    static foo = 4;
    static { const x = 5; }
  }
  return 6;
}
