import React from "react";
import RecentBooks from "../../utils/readUtils/recordRecent";
import { ViewerProps, ViewerState } from "./interface";
import localforage from "localforage";
import { withRouter } from "react-router-dom";
import BookUtil from "../../utils/fileUtils/bookUtil";
import iconv from "iconv-lite";
import chardet from "chardet";
import rtfToHTML from "@iarna/rtf-to-html";
import { xmlBookTagFilter, xmlBookToObj } from "../../utils/fileUtils/xmlUtil";
import StorageUtil from "../../utils/storageUtil";
import RecordLocation from "../../utils/readUtils/recordLocation";
import { mimetype } from "../../constants/mimetype";
import BackgroundWidget from "../../components/backgroundWidget";
import toast from "react-hot-toast";
import StyleUtil from "../../utils/readUtils/styleUtil";
import "./index.css";
import { HtmlMouseEvent } from "../../utils/mouseEvent";
import untar from "js-untar";
import ImageViewer from "../../components/imageViewer";
import Chinese from "chinese-s2t";

declare var window: any;

const { MobiRender, Azw3Render, TxtRender, StrRender, ComicRender } =
  window.Kookit;
let Unrar = window.Unrar;
let JSZip = window.JSZip;

class Viewer extends React.Component<ViewerProps, ViewerState> {
  epub: any;
  lock: boolean;
  constructor(props: ViewerProps) {
    super(props);
    this.state = {
      key: "",
      isFirst: true,
      scale: StorageUtil.getReaderConfig("scale") || 1,
      chapterTitle:
        RecordLocation.getScrollHeight(this.props.currentBook.key)
          .chapterTitle || "",
      readerMode: StorageUtil.getReaderConfig("readerMode") || "double",
      margin: parseInt(StorageUtil.getReaderConfig("margin")) || 30,
    };
    this.lock = false;
  }

  componentDidMount() {
    this.handleRenderBook();

    this.props.handleRenderFunc(this.handleRenderBook);
    var doit;
    window.addEventListener("resize", () => {
      if (StorageUtil.getReaderConfig("readerMode") === "single") {
        return;
      }
      clearTimeout(doit);
      doit = setTimeout(this.handleRenderBook, 100);
    });
  }
  handleRenderBook = () => {
    let { key, path, format, name } = this.props.currentBook;
    BookUtil.fetchBook(key, true, path).then((result) => {
      if (!result) {
        toast.error(this.props.t("Book not exsits"));
        return;
      }

      if (format === "MOBI") {
        this.handleMobi(result as ArrayBuffer);
      } else if (format === "AZW3") {
        this.handleAzw3(result as ArrayBuffer);
      } else if (format === "TXT") {
        this.handleTxt(result as ArrayBuffer);
      } else if (format === "MD") {
        this.handleMD(result as ArrayBuffer);
      } else if (format === "FB2") {
        this.handleFb2(result as ArrayBuffer);
      } else if (format === "RTF") {
        this.handleRtf(result as ArrayBuffer);
      } else if (format === "DOCX") {
        this.handleDocx(result as ArrayBuffer);
      } else if (
        format === "HTML" ||
        format === "XHTML" ||
        format === "HTM" ||
        format === "XML"
      ) {
        this.handleHtml(result as ArrayBuffer, format);
      } else if (format === "CBR") {
        this.handleCbr(result as ArrayBuffer);
      } else if (format === "CBT") {
        this.handleCbt(result as ArrayBuffer);
      } else if (format === "CBZ") {
        this.handleCbz(result as ArrayBuffer);
      }
      this.props.handleReadingState(true);

      RecentBooks.setRecent(this.props.currentBook.key);
      document.title = name + " - Koodo Reader";
    });
  };

  handleRest = (rendition: any) => {
    StyleUtil.addDefaultCss();
    rendition.setStyle(StyleUtil.getCustomCss(true));
    let bookLocation = RecordLocation.getScrollHeight(
      this.props.currentBook.key
    );

    rendition.goToPosition(
      bookLocation.text,
      bookLocation.chapterTitle,
      bookLocation.count
    );
    window.frames[0].document.addEventListener("click", (event) => {
      this.props.handleLeaveReader("left");
      this.props.handleLeaveReader("right");
      this.props.handleLeaveReader("top");
      this.props.handleLeaveReader("bottom");
    });

    HtmlMouseEvent(
      rendition,
      this.props.currentBook.key,
      this.state.readerMode
    );
    this.props.handleHtmlBook({
      key: this.props.currentBook.key,
      chapters: rendition.getChapter(),
      subitems: [],
      rendition: rendition,
    });
    if (
      StorageUtil.getReaderConfig("convertChinese") &&
      StorageUtil.getReaderConfig("convertChinese") !== "Default"
    ) {
      let iframe = document.getElementsByTagName("iframe")[0];
      if (!iframe) return;
      let doc = iframe.contentDocument;
      if (!doc) {
        return;
      }

      doc.querySelectorAll("p").forEach((item) => {
        if (item.innerText) {
          item.innerText =
            StorageUtil.getReaderConfig("convertChinese") ===
            "Simplified to Tranditional"
              ? Chinese.s2t(item.innerText)
              : Chinese.t2s(item.innerText);
        }
      });
    }
  };
  handleCbr = async (result: ArrayBuffer) => {
    let unrar = new Unrar(result);
    var entries = unrar.getEntries();
    let bookLocation = RecordLocation.getScrollHeight(
      this.props.currentBook.key
    );
    let rendition = new ComicRender(
      entries.map((item: any) => item.name),
      unrar,
      this.state.readerMode,
      "cbr"
    );
    await rendition.renderTo(
      document.getElementsByClassName("html-viewer-page")[0],
      parseInt(bookLocation.count || "0")
    );
    this.handleRest(rendition);
  };
  handleCbz = (result: ArrayBuffer) => {
    let zip = new JSZip();
    let bookLocation = RecordLocation.getScrollHeight(
      this.props.currentBook.key
    );
    zip.loadAsync(result).then(async (contents) => {
      let rendition = new ComicRender(
        Object.keys(contents.files).sort(),
        zip,
        this.state.readerMode,
        "cbz"
      );
      await rendition.renderTo(
        document.getElementsByClassName("html-viewer-page")[0],
        parseInt(bookLocation.count || "0")
      );
      this.handleRest(rendition);
    });
  };
  handleCbt = (result: ArrayBuffer) => {
    let bookLocation = RecordLocation.getScrollHeight(
      this.props.currentBook.key
    );
    untar(result).then(
      async (extractedFiles) => {
        let rendition = new ComicRender(
          extractedFiles.map((item: any) => item.name),
          extractedFiles,
          this.state.readerMode,
          "cbt"
        );
        await rendition.renderTo(
          document.getElementsByClassName("html-viewer-page")[0],
          parseInt(bookLocation.count || "0")
        );
        this.handleRest(rendition);
      },
      function (err) {
        // onError
      },
      function (extractedFile) {
        // onProgress
      }
    );
  };
  handleMobi = async (result: ArrayBuffer) => {
    let rendition = new MobiRender(result, this.state.readerMode);
    await rendition.renderTo(
      document.getElementsByClassName("html-viewer-page")[0]
    );
    this.handleRest(rendition);
  };
  handleAzw3 = async (result: ArrayBuffer) => {
    let rendition = new Azw3Render(result, this.state.readerMode);
    await rendition.renderTo(
      document.getElementsByClassName("html-viewer-page")[0]
    );
    this.handleRest(rendition);
  };
  handleCharset = (result: ArrayBuffer) => {
    return new Promise<string>(async (resolve, reject) => {
      let { books } = this.props;
      let charset = "";
      books.forEach((item) => {
        if (item.key === this.props.currentBook.key) {
          charset = chardet.detect(Buffer.from(result)) || "";
          item.charset = charset;
          this.props.handleReadingBook(item);
        }
      });

      await localforage.setItem("books", books);
      // this.props.handleFetchBooks();
      resolve(charset);
    });
  };
  handleTxt = async (result: ArrayBuffer) => {
    let charset = "";
    if (!this.props.currentBook.charset) {
      charset = await this.handleCharset(result);
    }
    let rendition = new TxtRender(
      result,
      this.state.readerMode,
      this.props.currentBook.charset || charset || "utf8"
    );
    await rendition.renderTo(
      document.getElementsByClassName("html-viewer-page")[0]
    );
    this.handleRest(rendition);
  };
  handleMD = (result: ArrayBuffer) => {
    var blob = new Blob([result], { type: "text/plain" });
    var reader = new FileReader();
    reader.onload = async (evt) => {
      let docStr = window.marked(evt.target?.result as any);
      let rendition = new StrRender(docStr, this.state.readerMode);
      await rendition.renderTo(
        document.getElementsByClassName("html-viewer-page")[0]
      );
      this.handleRest(rendition);
    };
    reader.readAsText(blob, "UTF-8");
  };
  handleRtf = async (result: ArrayBuffer) => {
    let charset = "";
    if (!this.props.currentBook.charset) {
      charset = await this.handleCharset(result);
    }
    let text = iconv.decode(
      Buffer.from(result),
      this.props.currentBook.charset || charset || "utf8"
    );

    rtfToHTML.fromString(text, async (err: any, html: any) => {
      let rendition = new StrRender(html, this.state.readerMode);
      await rendition.renderTo(
        document.getElementsByClassName("html-viewer-page")[0]
      );
      this.handleRest(rendition);
    });
  };
  handleDocx = (result: ArrayBuffer) => {
    window.mammoth
      .convertToHtml({ arrayBuffer: result })
      .then(async (res: any) => {
        let rendition = new StrRender(res.value, this.state.readerMode);
        await rendition.renderTo(
          document.getElementsByClassName("html-viewer-page")[0]
        );
        this.handleRest(rendition);
      });
  };
  handleFb2 = async (result: ArrayBuffer) => {
    let charset = "";
    if (!this.props.currentBook.charset) {
      charset = await this.handleCharset(result);
    }
    let fb2Str = iconv.decode(
      Buffer.from(result),
      this.props.currentBook.charset || charset || "utf8"
    );
    let bookObj = xmlBookToObj(Buffer.from(result));
    bookObj += xmlBookTagFilter(fb2Str);
    let rendition = new StrRender(bookObj, this.state.readerMode);
    await rendition.renderTo(
      document.getElementsByClassName("html-viewer-page")[0]
    );
    this.handleRest(rendition);
  };
  handleHtml = (result: ArrayBuffer, format: string) => {
    var blob = new Blob([result], {
      type: mimetype[format.toLocaleLowerCase()],
    });
    var reader = new FileReader();
    reader.onload = async (evt) => {
      const html = evt.target?.result as any;
      let rendition = new StrRender(html, this.state.readerMode);
      await rendition.renderTo(
        document.getElementsByClassName("html-viewer-page")[0]
      );
      this.handleRest(rendition);
    };
    reader.readAsText(blob, "UTF-8");
  };
  render() {
    return (
      <>
        <div
          className="html-viewer-page"
          style={
            document.body.clientWidth < 570
              ? { left: 0, right: 0 }
              : this.state.readerMode === "scroll"
              ? {
                  left: `calc(50vw - ${
                    270 * parseFloat(this.state.scale)
                  }px + 9px)`,
                  right: `calc(50vw - ${
                    270 * parseFloat(this.state.scale)
                  }px + 7px)`,
                  overflowY: "scroll",
                  overflowX: "hidden",
                }
              : this.state.readerMode === "single"
              ? {
                  left: `calc(50vw - ${
                    270 * parseFloat(this.state.scale)
                  }px + 15px)`,
                  right: `calc(50vw - ${
                    270 * parseFloat(this.state.scale)
                  }px + 15px)`,
                }
              : this.state.readerMode === "double"
              ? {
                  left: this.state.margin + 10 + "px",
                  right: this.state.margin + 10 + "px",
                }
              : {}
          }
        ></div>
        {StorageUtil.getReaderConfig("isHideBackground") === "yes" ? null : this
            .props.currentBook.key ? (
          <BackgroundWidget />
        ) : null}
        {this.props.htmlBook && (
          <ImageViewer
            {...{
              isShow: this.props.isShow,
              rendition: this.props.htmlBook.rendition,
              handleEnterReader: this.props.handleEnterReader,
              handleLeaveReader: this.props.handleLeaveReader,
            }}
          />
        )}
      </>
    );
  }
}
export default withRouter(Viewer as any);
