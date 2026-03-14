import { greet } from "./utils/helper";

export function bootstrap(): string {
  return greet("forge");
}

console.log(bootstrap());
