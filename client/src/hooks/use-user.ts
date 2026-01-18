import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type InsertUser } from "@shared/routes";
import { useLocation } from "wouter";

const USER_STORAGE_KEY = "lexi_chat_user_id";

export function useUser() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const getStoredUserId = () => {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const res = await fetch(api.users.create.path, {
        method: api.users.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error("Failed to create profile");
      }

      return api.users.create.responses[201].parse(await res.json());
    },
    onSuccess: (user) => {
      localStorage.setItem(USER_STORAGE_KEY, user.id.toString());
      queryClient.setQueryData(["currentUser"], user);
      setLocation("/chat");
    },
  });

  return {
    userId: getStoredUserId(),
    createUser: createMutation.mutate,
    isCreating: createMutation.isPending,
    error: createMutation.error,
  };
}
