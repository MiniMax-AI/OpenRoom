# Mystery App — User Guide

## The Case

Tech CEO **Marcus Vale** has been found dead in his locked second-floor study at midnight, during his Lumin product-launch gala. Five guests were in the house. One of them did it. The launch is cancelled. You have until morning to close the case.

## How to Play

You and Kayley investigate **together**. Neither of you knows the killer — a Game Master subprocess at `ws://localhost:5182` holds the locked truth. Every investigation action goes through it.

### The five actions

| Action | What it does |
|--------|--------------|
| `INTERROGATE` | Press a suspect. Watch their demeanor chip update as they slip. |
| `EXAMINE_LOCATION` | Walk a location. New evidence may appear in the right-hand board. |
| `COLLECT_EVIDENCE` | Bag a specific evidence item for the case file. |
| `READ_DOSSIER` | Open the long-form file on a suspect — background, motive, opportunity. |
| `MAKE_ACCUSATION` | Endgame. One shot. Name the killer, motive, weapon, and method. |

### Tips

- Demeanor chips only appear when a suspect **changes** under pressure. A chip shift is a clue.
- Evidence unlocked at one location often points to a suspect who had access there.
- When you're ready to accuse, click **Make Accusation** in the top-right. Be specific — vague guesses fail.

## Connection status

The dot in the top-right shows the GM WebSocket state. If it's red, the GM subprocess isn't running — start it and the dot will turn green.
