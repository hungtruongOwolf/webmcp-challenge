import EmptyState from "@/app/components/empty-state";

const Home = () => {
  return (
    <>
      <h1 data-page-title tabIndex={-1} className="sr-only">
        Conversations
      </h1>
      <EmptyState />
    </>
  );
};

export default Home;
