import { Link } from "react-router-dom";
import { Button, EmptyState, PageHeader } from "../components/ui";

export function NotFoundPage() {
  return (
    <>
      <PageHeader eyebrow="404" title="That page does not exist" />
      <EmptyState
        icon="explore_off"
        title="Nothing here"
        description="The link may be out of date. The sidebar has everything the application can do."
        action={
          <Link to="/dashboard">
            <Button variant="primary" icon="home">Back to the dashboard</Button>
          </Link>
        }
      />
    </>
  );
}
