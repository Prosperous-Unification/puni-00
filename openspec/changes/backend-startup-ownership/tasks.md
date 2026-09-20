## 1. Open the change

- [ ] 1.1 Record the intent, lifecycle design, delta requirements, implementation slices and verification structure.

## 2. Pin existing startup and shutdown behavior

- [ ] 2.1 Extend the boot tests with the existing startup refusals, shutdown order, repeated stop and unhealthy-schema behavior.

## 3. Transfer lifecycle ownership to DI Bag

- [ ] 3.1 Add the failing lifecycle cases, make DI Bag own startup and shutdown, and await `bootBe01` at every caller.

## 4. Prove lifecycle checks can fail

- [ ] 4.1 Inject and observe the six specified ownership faults, restore each passing version, and record adjacent proof comments.

## 5. Complete the verification record

- [ ] 5.1 Record every command, result, negative proof and unverified check, then validate and format the completed change.
