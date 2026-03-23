import short from "short-uuid";
import { uuidv7 } from "uuidv7";

export default short.createTranslator({ uuid: uuidv7 as never });
