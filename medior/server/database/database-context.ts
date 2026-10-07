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
    function (this: Query<unknown, unknown>, next) {
      checkBackgroundExecution();

      if (getBackgroundSession()) this.session(getBackgroundSession());

      next();
    },
  );

  schema.pre("aggregate", function (next) {
    checkBackgroundExecution();

    if (getBackgroundSession()) this.session(getBackgroundSession());

    next();
  });

  schema.pre("save", function (next) {
    checkBackgroundExecution();

    if (getBackgroundSession()) this.$session(getBackgroundSession());

    next();
  });
};
