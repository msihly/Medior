import type { Query, Schema } from "mongoose";
import {
  backgroundExecution,
  checkBackgroundExecution,
} from "medior/server/database/background-execution";

export const getBackgroundSession = () => backgroundExecution.getStore()?.session;

/** Attach cancellable background sessions without starting database transactions. */
export const backgroundExecutionPlugin = (schema: Schema) => {
  schema.pre(
    /^(find|count|distinct|update|delete|replace)/,
    function (this: Query<unknown, unknown>) {
      checkBackgroundExecution();

      if (getBackgroundSession()) this.session(getBackgroundSession());
    },
  );

  schema.pre("aggregate", function () {
    checkBackgroundExecution();

    if (getBackgroundSession()) this.session(getBackgroundSession());
  });

  schema.pre("save", function () {
    checkBackgroundExecution();

    if (getBackgroundSession()) this.$session(getBackgroundSession());
  });
};
