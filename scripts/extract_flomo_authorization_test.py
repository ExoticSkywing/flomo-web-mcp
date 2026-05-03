import unittest

from extract_flomo_authorization import analyze_har, mask_secret


class ExtractFlomoAuthorizationTest(unittest.TestCase):
    def test_extracts_authorization_from_flomo_api_request(self):
        har = {
            "log": {
                "entries": [
                    {
                        "request": {
                            "method": "GET",
                            "url": "https://flomoapp.com/api/v1/memo/updated/",
                            "headers": [
                                {"name": "Authorization", "value": "Bearer fake-token-1234567890"},
                            ],
                        },
                        "response": {"status": 200},
                    }
                ],
            }
        }

        report = analyze_har(har)

        self.assertEqual(report.flomo_api_requests, 1)
        self.assertEqual(len(report.candidates), 1)
        self.assertEqual(report.candidates[0].value, "Bearer fake-token-1234567890")

    def test_preflight_authorization_header_is_not_a_token(self):
        har = {
            "log": {
                "entries": [
                    {
                        "request": {
                            "method": "OPTIONS",
                            "url": "https://flomoapp.com/api/v1/memo/updated/",
                            "headers": [
                                {
                                    "name": "access-control-request-headers",
                                    "value": "authorization,device-id,device-model,platform",
                                },
                            ],
                        },
                        "response": {"status": 204},
                    }
                ],
            }
        }

        report = analyze_har(har)

        self.assertEqual(report.flomo_api_requests, 1)
        self.assertEqual(report.preflight_authorization_requests, 1)
        self.assertEqual(report.candidates, [])

    def test_masks_secret(self):
        self.assertEqual(mask_secret("Bearer abcdefghijklmnopqrstuvwxyz"), "Bearer abcdefgh...uvwxyz")


if __name__ == "__main__":
    unittest.main()
