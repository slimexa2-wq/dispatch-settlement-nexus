import { fastPathReply, isCasualChat } from "./src/ai/chat-fastpath.js";
console.log("FP(你是谁) =", JSON.stringify(fastPathReply("你是谁")));
console.log("isCasual(今天天气真好) =", isCasualChat("今天天气真好"));
console.log("isCasual(查一下宜宾项目的人员统计) =", isCasualChat("查一下宜宾项目的人员统计"));
