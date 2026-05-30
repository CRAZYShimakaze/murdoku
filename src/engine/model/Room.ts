/** A named, coloured region of the board. Tiles reference a room by id. */
export class Room {
  constructor(
    readonly id: string,
    readonly nameKey: string,
    readonly color: string,
  ) {}
}
