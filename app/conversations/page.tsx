"use client";

import clsx from "clsx";

import useConversation from "@/app/hooks/use-conversation";
import EmptyState from "@/app/components/empty-state";

const Home = () => {
  const { isOpen } = useConversation();

  return (
    <>
      <h1 data-page-title tabIndex={-1} className="sr-only">
        Conversations
      </h1>
      <div
        className={clsx(
          "lg:pl-80 h-full lg:block",
          isOpen ? "block" : "hidden"
        )}
      >
        <EmptyState />
      </div>
    </>
  );
};

export default Home;
