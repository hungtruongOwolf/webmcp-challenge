import EmptyState from "@/app/components/empty-state";

const Users = () => {
  return (
    <>
      <h1 data-page-title tabIndex={-1} className="sr-only">
        People
      </h1>
      <div className="hidden lg:block lg:pl-80 h-full">
        <EmptyState />
      </div>
    </>
  );
};

export default Users;
