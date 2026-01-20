import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, CheckCheck } from "lucide-react";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
  isSeen?: boolean;
}

export function ChatBubble({ role, content, isTyping, isSeen }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex flex-col w-full mb-4",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] px-5 py-3 rounded-2xl text-sm md:text-base leading-relaxed shadow-md relative",
          isUser
            ? "bg-gradient-to-br from-primary to-secondary text-white rounded-br-none"
            : "bg-card border border-white/10 text-gray-200 rounded-bl-none shadow-black/20"
        )}
      >
        {isTyping && !content ? (
          <div className="flex gap-1 h-6 items-center px-1">
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-a:text-pink-500 prose-a:underline hover:prose-a:text-pink-400 break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
      
      {isUser && (
        <div className="flex items-center gap-1 mt-1 px-1">
          {isSeen ? (
            <>
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tighter">Seen</span>
              <CheckCheck className="w-3 h-3 text-pink-500" />
            </>
          ) : (
            <>
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tighter">Sent</span>
              <Check className="w-3 h-3 text-neutral-500" />
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
