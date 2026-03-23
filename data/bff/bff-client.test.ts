import { beforeEach, describe, expect, it, vi } from "vitest";

import { asQuery, type QueryResult } from "../query";
import {
  consumeBffRequestDurationMsForSignal,
  createStudioBFFClient,
  deserializeError,
  serializeError,
  type StudioBFFClient,
} from "./bff-client";

describe("bff/bff-client", () => {
  describe("createStudioBFFClient", () => {
    it('should return an object with a "execute" method', () => {
      const client = createStudioBFFClient({
        url: "https://example.com",
      });

      expect(client).toBeTypeOf("object");
      expect(client).toHaveProperty("execute");
      expect(client.execute).toBeTypeOf("function");
    });
  });

  describe("StudioBFFClient", () => {
    const customHeaders = {
      Authorization: "Bearer 1283g17289g9asgd8208jg93g==",
    };
    const customPayload = { tenantId: "123" };
    const url = "https://example.com";

    describe("execute", () => {
      const query = asQuery({
        sql: "select 1 as thing where ? = ?",
        parameters: [1, 1],
      });
      const results = [{ thing: 1 }];

      let client: StudioBFFClient;
      const fetchFn = vi.fn((...args: Parameters<typeof fetch>) =>
        fetch(...args),
      );

      beforeEach(() => {
        client = createStudioBFFClient({
          customHeaders,
          customPayload,
          fetch: fetchFn,
          url,
        });
      });

      it("should send a POST request to the BFF server with the query object, and optional custom paylod, headers", async () => {
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([null, results])),
        );

        const response = await client.execute(query);

        expect(fetchFn).toHaveBeenCalledWith(url, {
          body: expect.toSatisfy((value) => {
            expect(JSON.parse(value as string)).toStrictEqual({
              customPayload,
              procedure: "query",
              query,
            });

            return true;
          }) as string,
          headers: expect.objectContaining(customHeaders) as object,
          method: "POST",
        });

        expect(response).toStrictEqual([null, results]);
      });

      it("should return (not throw) an error if the request fails", async () => {
        const error = "Internal server error";
        fetchFn.mockResolvedValueOnce(new Response(error, { status: 500 }));

        const response = await client.execute(query);

        expect(response).toStrictEqual([new Error(error)]);
      });

      it("should return (not throw) an error if the response contains one (regular error)", async () => {
        const serializedError = serializeError(new Error("Error 1"));
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([serializedError, null])),
        );

        const response = await client.execute(query);

        expect(response).toStrictEqual([deserializeError(serializedError)]);
      });

      it("should return (not throw) an error if the response contains one (aggragte error)", async () => {
        const aggregateError = new AggregateError(
          [new Error("Error 1"), new Error("Error 2")],
          "Multiple errors occurred",
        );
        const serializedError = serializeError(aggregateError);
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([serializedError, null])),
        );

        const response = await client.execute(query);

        expect(response).toStrictEqual([deserializeError(serializedError)]);
      });

      it("records fetch duration for abort-signal scoped requests", async () => {
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([null, results])),
        );
        const abortController = new AbortController();
        const nowSpy = vi
          .spyOn(performance, "now")
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(126);

        try {
          const response = await client.execute(query, {
            abortSignal: abortController.signal,
          });

          expect(response).toStrictEqual([null, results]);
          expect(
            consumeBffRequestDurationMsForSignal(abortController.signal),
          ).toBe(26);
          expect(
            consumeBffRequestDurationMsForSignal(abortController.signal),
          ).toBeNull();
        } finally {
          nowSpy.mockRestore();
        }
      });

      it("prefers browser resource timing duration when available", async () => {
        const response = new Response(JSON.stringify([null, results]));
        Object.defineProperty(response, "url", {
          value: "https://example.com",
        });
        fetchFn.mockResolvedValueOnce(response);
        const abortController = new AbortController();
        const nowSpy = vi
          .spyOn(performance, "now")
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(460);
        const entriesSpy = vi
          .spyOn(performance, "getEntriesByType")
          .mockReturnValue([
            {
              duration: 23.4,
              initiatorType: "fetch",
              name: "https://example.com",
              startTime: 101,
            } as PerformanceResourceTiming,
          ]);

        try {
          const response = await client.execute(query, {
            abortSignal: abortController.signal,
          });

          expect(response).toStrictEqual([null, results]);
          expect(entriesSpy).toHaveBeenCalledWith("resource");
          expect(
            consumeBffRequestDurationMsForSignal(abortController.signal),
          ).toBe(23);
        } finally {
          nowSpy.mockRestore();
          entriesSpy.mockRestore();
        }
      });

      it("uses delayed resource timing entries when they arrive on the next tick", async () => {
        const response = new Response(JSON.stringify([null, results]));
        Object.defineProperty(response, "url", {
          value: "https://example.com",
        });
        fetchFn.mockResolvedValueOnce(response);
        const abortController = new AbortController();
        const nowSpy = vi
          .spyOn(performance, "now")
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(460);
        const entriesSpy = vi
          .spyOn(performance, "getEntriesByType")
          .mockReturnValueOnce([])
          .mockReturnValueOnce([
            {
              duration: 17.9,
              initiatorType: "fetch",
              name: "https://example.com",
              startTime: 101,
            } as PerformanceResourceTiming,
          ]);

        try {
          const response = await client.execute(query, {
            abortSignal: abortController.signal,
          });

          expect(response).toStrictEqual([null, results]);
          expect(
            consumeBffRequestDurationMsForSignal(abortController.signal),
          ).toBe(18);
        } finally {
          nowSpy.mockRestore();
          entriesSpy.mockRestore();
        }
      });

      it("selects the resource entry closest to the request start time", async () => {
        const response = new Response(JSON.stringify([null, results]));
        Object.defineProperty(response, "url", {
          value: "https://example.com",
        });
        fetchFn.mockResolvedValueOnce(response);
        const abortController = new AbortController();
        const nowSpy = vi
          .spyOn(performance, "now")
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(460);
        const entriesSpy = vi
          .spyOn(performance, "getEntriesByType")
          .mockReturnValue([
            {
              duration: 9.1,
              initiatorType: "fetch",
              name: "https://example.com",
              startTime: 101,
            } as PerformanceResourceTiming,
            {
              duration: 21.4,
              initiatorType: "fetch",
              name: "https://example.com",
              startTime: 160,
            } as PerformanceResourceTiming,
          ]);

        try {
          const response = await client.execute(query, {
            abortSignal: abortController.signal,
          });

          expect(response).toStrictEqual([null, results]);
          expect(
            consumeBffRequestDurationMsForSignal(abortController.signal),
          ).toBe(9);
        } finally {
          nowSpy.mockRestore();
          entriesSpy.mockRestore();
        }
      });

      it("matches resource timings when response URL has a trailing slash", async () => {
        const response = new Response(JSON.stringify([null, results]));
        Object.defineProperty(response, "url", {
          value: "https://example.com/",
        });
        fetchFn.mockResolvedValueOnce(response);
        const abortController = new AbortController();
        const nowSpy = vi
          .spyOn(performance, "now")
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(460);
        const entriesSpy = vi
          .spyOn(performance, "getEntriesByType")
          .mockReturnValue([
            {
              duration: 11.2,
              initiatorType: "fetch",
              name: "https://example.com",
              startTime: 101,
            } as PerformanceResourceTiming,
          ]);

        try {
          const response = await client.execute(query, {
            abortSignal: abortController.signal,
          });

          expect(response).toStrictEqual([null, results]);
          expect(
            consumeBffRequestDurationMsForSignal(abortController.signal),
          ).toBe(11);
        } finally {
          nowSpy.mockRestore();
          entriesSpy.mockRestore();
        }
      });

      it("should return (not throw) an error if the response is not JSON", async () => {
        const error = "Internal server error";
        fetchFn.mockResolvedValueOnce(new Response(error, { status: 200 }));

        const response = await client.execute(query);

        expect(response).toStrictEqual([
          expect.toSatisfy((value) => {
            if (!(value instanceof Error)) return false;

            expect(value.message).toMatch(/is not valid JSON$/);

            return true;
          }),
        ]);
      });

      it('should abort when the "abortSignal" is triggered', async () => {
        const abortController = new AbortController();

        const resultsPromise = client.execute(query, {
          abortSignal: abortController.signal,
        });

        abortController.abort();

        const [error, results] = await resultsPromise;

        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty("name", "AbortError");
        expect(error).toHaveProperty("message", "This operation was aborted");
        expect(results).toBeUndefined();
      });

      it('should deserialize the results with the provided "resultDeserializerFn" if it is set', async () => {
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([null, results])),
        );
        const resultDeserializerFn = vi.fn((results) =>
          (results as object[]).map((result) => ({ ...result, moshe: "haim" })),
        );

        client = createStudioBFFClient({
          customHeaders,
          customPayload,
          fetch: fetchFn,
          resultDeserializerFn,
          url,
        });

        const response = await client.execute(query);

        expect(resultDeserializerFn).toHaveBeenCalledWith(results);
        expect(response).toStrictEqual([
          null,
          resultDeserializerFn.mock.results[0]!.value,
        ]);
      });
    });

    describe("executeSequence", () => {
      const query0 = asQuery({
        sql: "select 1 as thing where ? = ?",
        parameters: [1, 1],
      });
      const query1 = asQuery({
        sql: "select 2 as thing where ? = ?",
        parameters: [2, 2],
      });
      const result0: QueryResult<typeof query0> = [{ thing: 1 }];
      const result1: QueryResult<typeof query1> = [{ thing: 2 }];
      const sequence = [query0, query1] as const;
      const result = [
        [null, result0],
        [null, result1],
      ] as const;

      let client: StudioBFFClient;
      const fetchFn = vi.fn((...args: Parameters<typeof fetch>) =>
        fetch(...args),
      );

      beforeEach(() => {
        client = createStudioBFFClient({
          customHeaders,
          customPayload,
          fetch: fetchFn,
          url,
        });
      });

      it("should send a POST request to the BFF server with the sequence, and optional custom paylod, headers", async () => {
        fetchFn.mockResolvedValueOnce(new Response(JSON.stringify(result)));

        const response = await client.executeSequence(sequence);

        expect(fetchFn).toHaveBeenCalledWith(url, {
          body: expect.toSatisfy((value) => {
            expect(JSON.parse(value as string)).toStrictEqual({
              customPayload,
              procedure: "sequence",
              sequence,
            });

            return true;
          }) as string,
          headers: expect.objectContaining(customHeaders) as object,
          method: "POST",
        });

        expect(response).toStrictEqual(result);
      });

      it("should return (not throw) an error if the request fails", async () => {
        const error = "Internal server error";
        fetchFn.mockResolvedValueOnce(new Response(error, { status: 500 }));

        const response = await client.executeSequence(sequence);

        expect(response).toStrictEqual([[new Error(error)]]);
      });

      it("should return (not throw) an error if the response contains one (regular error)", async () => {
        const serializedError = serializeError(new Error("Error 1"));
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([[serializedError]])),
        );

        const response = await client.executeSequence(sequence);

        expect(response).toStrictEqual([[deserializeError(serializedError)]]);
      });

      it("should return (not throw) an error if the response contains one (aggregate error)", async () => {
        const aggregateError = new AggregateError(
          [new Error("Error 1"), new Error("Error 2")],
          "Multiple errors occurred",
        );
        const serializedError = serializeError(aggregateError);
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([[serializedError]])),
        );

        const response = await client.executeSequence(sequence);

        expect(response).toStrictEqual([[deserializeError(serializedError)]]);
      });

      it("should return (not throw) an error if the response is not JSON", async () => {
        const error = "Internal server error";
        fetchFn.mockResolvedValueOnce(new Response(error, { status: 200 }));

        const response = await client.executeSequence(sequence);

        expect(response).toStrictEqual([
          [
            expect.toSatisfy((value) => {
              if (!(value instanceof Error)) return false;

              expect(value.message).toMatch(/is not valid JSON$/);

              return true;
            }),
          ],
        ]);
      });

      it('should abort when the "abortSignal" is triggered', async () => {
        const abortController = new AbortController();

        const resultsPromise = client.executeSequence(sequence, {
          abortSignal: abortController.signal,
        });

        abortController.abort();

        const [[error, results], otherResults] = await resultsPromise;

        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty("name", "AbortError");
        expect(error).toHaveProperty("message", "This operation was aborted");
        expect(results).toBeUndefined();
        expect(otherResults).toBeUndefined();
      });

      it('should deserialize the results with the provided "resultDeserializerFn" if it is set', async () => {
        fetchFn.mockResolvedValueOnce(new Response(JSON.stringify(result)));
        const resultDeserializerFn = vi.fn((results) =>
          (results as object[]).map((result) => ({ ...result, moshe: "haim" })),
        );

        client = createStudioBFFClient({
          customHeaders,
          customPayload,
          fetch: fetchFn,
          resultDeserializerFn,
          url,
        });

        const response = await client.executeSequence(sequence);

        expect(resultDeserializerFn).toHaveBeenCalledTimes(2);
        expect(resultDeserializerFn).toHaveBeenNthCalledWith(1, result0);
        expect(resultDeserializerFn).toHaveBeenNthCalledWith(2, result1);
        expect(response).toStrictEqual([
          [null, resultDeserializerFn.mock.results[0]!.value],
          [null, resultDeserializerFn.mock.results[1]!.value],
        ]);
      });
    });

    describe("executeTransaction", () => {
      const query0 = asQuery({
        sql: "select 1 as thing where ? = ?",
        parameters: [1, 1],
      });
      const query1 = asQuery({
        sql: "select 2 as thing where ? = ?",
        parameters: [2, 2],
      });
      const queries = [query0, query1] as const;
      const result0: QueryResult<typeof query0> = [{ thing: 1 }];
      const result1: QueryResult<typeof query1> = [{ thing: 2 }];
      const result = [null, [result0, result1]] as const;

      let client: StudioBFFClient;
      const fetchFn = vi.fn((...args: Parameters<typeof fetch>) =>
        fetch(...args),
      );

      beforeEach(() => {
        client = createStudioBFFClient({
          customHeaders,
          customPayload,
          fetch: fetchFn,
          url,
        });
      });

      it("sends a POST request with transactional queries", async () => {
        fetchFn.mockResolvedValueOnce(new Response(JSON.stringify(result)));

        const response = await client.executeTransaction(queries);

        expect(fetchFn).toHaveBeenCalledWith(url, {
          body: expect.toSatisfy((value) => {
            expect(JSON.parse(value as string)).toStrictEqual({
              customPayload,
              procedure: "transaction",
              queries,
            });

            return true;
          }) as string,
          headers: expect.objectContaining(customHeaders) as object,
          method: "POST",
        });
        expect(response).toStrictEqual(result);
      });

      it("returns an error when the transactional request fails", async () => {
        const error = "Internal server error";
        fetchFn.mockResolvedValueOnce(new Response(error, { status: 500 }));

        const response = await client.executeTransaction(queries);

        expect(response).toStrictEqual([new Error(error)]);
      });
    });

    describe("lintSql", () => {
      const details = {
        schemaVersion: "schema-abc123",
        sql: "select * from users",
      };
      const lintResult = {
        diagnostics: [
          {
            from: 14,
            message: 'relation "users" does not exist',
            severity: "error",
            to: 15,
          },
        ],
        schemaVersion: "schema-abc123",
      };

      let client: StudioBFFClient;
      const fetchFn = vi.fn((...args: Parameters<typeof fetch>) =>
        fetch(...args),
      );

      beforeEach(() => {
        client = createStudioBFFClient({
          customHeaders,
          customPayload,
          fetch: fetchFn,
          url,
        });
      });

      it("should send a lint request through the same BFF channel with custom auth payload", async () => {
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([null, lintResult])),
        );

        const response = await client.lintSql(details);

        expect(fetchFn).toHaveBeenCalledWith(url, {
          body: expect.toSatisfy((value) => {
            expect(JSON.parse(value as string)).toStrictEqual({
              customPayload,
              procedure: "sql-lint",
              schemaVersion: "schema-abc123",
              sql: "select * from users",
            });

            return true;
          }) as string,
          headers: expect.objectContaining(customHeaders) as object,
          method: "POST",
        });

        expect(response).toStrictEqual([null, lintResult]);
      });

      it("should return an error tuple when lint request fails", async () => {
        fetchFn.mockResolvedValueOnce(
          new Response("lint failed", { status: 500 }),
        );

        const response = await client.lintSql(details);

        expect(response).toStrictEqual([new Error("lint failed")]);
      });

      it("should return an error tuple when lint response includes an error", async () => {
        const serializedError = serializeError(new Error("lint exploded"));
        fetchFn.mockResolvedValueOnce(
          new Response(JSON.stringify([serializedError, null])),
        );

        const response = await client.lintSql(details);

        expect(response).toStrictEqual([deserializeError(serializedError)]);
      });

      it("should abort lint requests", async () => {
        const abortController = new AbortController();

        const lintPromise = client.lintSql(details, {
          abortSignal: abortController.signal,
        });
        abortController.abort();

        const [error, result] = await lintPromise;

        expect(error).toBeInstanceOf(Error);
        expect(error).toHaveProperty("name", "AbortError");
        expect(error).toHaveProperty("message", "This operation was aborted");
        expect(result).toBeUndefined();
      });
    });
  });
});
