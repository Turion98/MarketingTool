import type { Metadata } from "next";
import TestChatClient from "./TestChatClient";

export const metadata: Metadata = {
  title: "Teszt Chatbot | Questell",
  description: "Egyszeru AI node chatbot teszt oldal.",
};

export default function LoginTestPage() {
  return <TestChatClient />;
}
