from app.service.document_service import extract_plain_text


def test_extract_plain_text_from_tiptap_document() -> None:
    document = {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1, "blockId": "title"},
                "content": [{"type": "text", "text": "AI 产品规划"}],
            },
            {
                "type": "paragraph",
                "attrs": {"blockId": "intro"},
                "content": [
                    {"type": "text", "text": "文档"},
                    {"type": "text", "text": "与导图协同"},
                ],
            },
        ],
    }

    assert extract_plain_text(document) == "AI 产品规划 文档与导图协同"
