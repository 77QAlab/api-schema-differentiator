/**
 * schema-sentinel + REST Assured (Java) Example
 *
 * Use schema-sentinel CLI from Java via ProcessBuilder.
 * Works with JUnit, TestNG, or any Java test framework.
 *
 * Prerequisites:
 *   - Node.js installed on the machine
 *   - npm install -g schema-sentinel (or local in project)
 */

import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import static org.junit.jupiter.api.Assertions.*;

public class RestAssuredExample {

    @BeforeAll
    static void setup() {
        RestAssured.baseURI = "https://api.example.com";
    }

    @Test
    void testUsersApiSchemaNotDrifted() throws Exception {
        Response response = RestAssured.given()
            .header("Accept", "application/json")
            .get("/v2/users/1");

        assertEquals(200, response.statusCode());

        // Check schema drift
        int exitCode = checkSchemaDrift("GET /api/v2/users/:id", response.body().asString());
        assertEquals(0, exitCode, "Schema drift detected for Users API!");
    }

    @Test
    void testProductsApiSchemaNotDrifted() throws Exception {
        Response response = RestAssured.given()
            .header("Accept", "application/json")
            .get("/v2/products");

        assertEquals(200, response.statusCode());

        int exitCode = checkSchemaDrift("GET /api/v2/products", response.body().asString());
        assertEquals(0, exitCode, "Schema drift detected for Products API!");
    }

    /**
     * Helper: Run schema-sentinel CLI to check for drift.
     * Returns 0 if no breaking drift, 1 if drift detected.
     */
    private int checkSchemaDrift(String key, String responseBody) throws Exception {
        // Write response to temp file
        File tmpFile = File.createTempFile("schema-check-", ".json");
        try (FileWriter writer = new FileWriter(tmpFile)) {
            writer.write(responseBody);
        }

        try {
            ProcessBuilder pb = new ProcessBuilder(
                "npx", "schema-sentinel", "check",
                "-k", key,
                "-d", tmpFile.getAbsolutePath(),
                "-s", "./schemas",
                "--fail-on", "breaking"
            );
            pb.inheritIO(); // Print schema-sentinel output to test console
            Process process = pb.start();
            return process.waitFor();
        } finally {
            tmpFile.delete();
        }
    }
}

