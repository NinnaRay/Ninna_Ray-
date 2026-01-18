import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
}

export function ChatBubble({ role, content, isTyping }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex w-full mb-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] px-5 py-3 rounded-2xl text-sm md:text-base leading-relaxed shadow-md",
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
    </motion.div>
  );
}
